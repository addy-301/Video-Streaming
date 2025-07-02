import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt from 'jsonwebtoken';
const generateAccessAndRefreshTokens=async(userId)=>{
        try{
            const user=await User.findById(userId)  
            const accessToken=user.generateAccessToken();
            const refreshToken=user.generateRefreshToken();
            user.refreshToken=refreshToken;
            await user.save({validateBeforeSave: false});
            return {accessToken, refreshToken};
        }
        catch(error){
            throw new ApiError(500, "Failed to generate tokens");
        }
    }

const registerUser = asyncHandler(async(req, res)=>{
    // get user detail from frontend
    // validate user detail
    // check if user already exists
    // check for images, check for avatar
    // upload images to cloudinary, avatar uploaded or not
    // create user object, create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return response

    const {fullName, email, username, password}=req.body
    //console.log("REQ.BODY: ", req.body);
    if([fullName, email, username, password].some((field) => field?.trim()==="")) {
        throw new ApiError(400, "All fields are required");
    }
    const existingUser=await User.findOne({
        $or:[
            {email},
            {username}
        ]
    })
    if(existingUser) {
        throw new ApiError(409, "User already exists with this email or username");
    }
    const avatarLocalPath=req.files?.avatar[0]?.path;
    //const coverImageLocalPath=req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files&&Array.isArray(req.files.coverImage)&&req.files.coverImage.length>0) {
        coverImageLocalPath=req.files.coverImage[0].path;
    }
    // console.log("REQUEST.FILES: ", req.files);
    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required");
    }
    const avatar=await uploadOnCloudinary(avatarLocalPath)
    const coverImage=await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar)
        throw new ApiError(500, "Failed to upload avatar");
    const user=await User.create({
        fullName,
        email,
        username:username.toLowerCase(),
        password,
        avatar:avatar.url,
        coverImage:coverImage?.url||""
    })
    const userCreated=await User.findById(user._id).select("-password -refreshToken");
    if(!userCreated)
        throw new ApiError(500, "Failed to create user");
    return res.status(201).json(new ApiResponse(200, userCreated, "User created successfully"));
})

const loginUser = asyncHandler(async(req, res)=>{
    // get data from request body
    // username or email
    // find the user
    // password check
    // access and refresh token generation
    // send cookies
    const {email, username, password}=req.body;
    if(!username && !email)
        throw new ApiError(400, "Username or email is required");
    const user=await User.findOne({
        $or:[{username}, {email}]
    })
    if(!user)
        throw new ApiError(404, "User does not exist");
    
    const validPassword=await user.isPasswordCorrect(password)
    if(!validPassword)
        throw new ApiError(401, "Invalid password");

    const {accessToken, refreshToken}=await generateAccessAndRefreshTokens(user._id);

    const loggedInUser=await User.findById(user._id).select("-password -refreshToken");

    const options={
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, {
        user: loggedInUser, accessToken, refreshToken
    }, "User logged in successfully"));
    
})

const logoutUser = asyncHandler(async(req, res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1
            }
        },
        {
                new: true,
        }
    )
    const options={
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
})

const refreshAccessToken = asyncHandler(async(req, res)=>{
    const rcvRefreshToken=req.cookies.refreshToken||req.body.refreshToken
    if(!rcvRefreshToken)
        throw new ApiError(401, "Unauthorized request");
    try {
        const decodedToken=jwt.verify(rcvRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        const user=await User.findById(decodedToken?._id)
        if(!user)
            throw new ApiError(404, "User not found");
        if(rcvRefreshToken!==user?.refreshToken)
            throw new ApiError(401, "Refresh token expired or invalid");
        const options={
            httpOnly: true,
            secure: true
        }
        const {accessToken, newRefreshToken}=await generateAccessAndRefreshTokens(user._id)
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(new ApiResponse(200, {accessToken, refreshToken: newRefreshToken}, "Access token refreshed successfully"));
    } catch (error) {
        throw new ApiError(401, error?.message||"Unauthorized request");
    }
})

const changeCurrentPassword=asyncHandler(async(req, res)=>{
    const {oldPassword, newPassword}=req.body;
    const user=await User.findById(req.user?._id)
    const isPasswordCorrect=await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect)
        throw new ApiError(401, "Old password is incorrect");
    user.password=newPassword;
    await user.save({validateBeforeSave: false});
    return res.status(200).json(new ApiResponse(200), {}, "Password changesd successfully");
})

const getCurrentUser=asyncHandler(async(req, res)=>{
    return res.status(200).json(new ApiResponse(200, req.user, "Current user fetched successfully"));
})

const updateAccountDetails=asyncHandler(async(req, res)=>{
    const {fullName, email}=req.body;//choose whatever fields you want to update
    if(!fullName || !email)
        throw new ApiError(400, "Full name and email are required");
    const user=User.findByIdAndUpdate(req.user?._id, {
        $set:{
            fullName, 
            email
        }
    }, {new: true}).select("-password")
    return res.status(200).json(new ApiResponse(200, user, "User details updated successfully"));
})

const updateUserAvatar=asyncHandler(async(req, res)=>{
    const avatarLocalPath=req.file?.path
    // TODO: delete old avatar from cloudinary
    if(!avatarLocalPath)
        throw new ApiError(400, "Avatar is required");
    const avatar=await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url)
        throw new ApiError(400, "Error while uploading Avatar");
    const user=await User.findByIdAndUpdate(req.user?._id, {
        $set:{
            avatar: avatar.url
        }
    }, {new: true}).select("-password");
    return res.status(200).json(new ApiResponse(200, user, "Avatar updated successfully"));
})

const updateUserCoverImage=asyncHandler(async(req, res)=>{
    const coverImageLocalPath=req.file?.path
    // TODO: delete old cover image from cloudinary
    if(!coverImageLocalPath)
        throw new ApiError(400, "Cover image is required");
    const coverImage=await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage.url)
        throw new ApiError(400, "Error while uploading Cover Image");
    const user=await User.findByIdAndUpdate(req.user?._id,{
        $set:{
            coverImage: coverImage.url
        }
    }, {new: true}).select("-password");
    return res.status(200).json(new ApiResponse(200, user, "Cover image updated successfully"));
})

const getUserChannelProfile=asyncHandler(async(req, res)=>{
    const {username}=req.params
    if(!username?.trim())
        throw new ApiError(400, "Username is required");
    const channel=await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup:{
                from: "videos",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount:{
                    $size: "$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project:{
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])
    if(!channel?.length)
        throw new ApiError(404, "Channel not found");
    console.log("CHANNEL: ", channel);
    return res.status(200).json(new ApiResponse(200, channel[0], "Channel profile fetched successfully"));
})

const getWatchHistory=asyncHandler(async(req, res)=>{
    const user=await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:'videos',
                localField: 'watchHistory',
                foreignField: '_id',
                as: 'watchHistory',
                pipeline:[
                    {
                        $lookup:{
                            from:'users',
                            localField: 'owner',
                            foreignField: '_id',
                            as: 'owner',
                            pipeline: [
                                {
                                    $project:{
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner: {
                                $first: "$owner"
                            }
                        }  
                    }
                ]
            }
        }
    ])
    return res.status(200).json(new ApiResponse(200, user[0].watchHistory, "Watch history fetched successfully"));
})

export {
    registerUser, 
    loginUser, 
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateAccountDetails, 
    updateUserAvatar, 
    updateUserCoverImage, 
    getUserChannelProfile,
    getWatchHistory
};