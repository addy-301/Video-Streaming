import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/ApiError.js';
import {User} from '../models/user.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
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
    const existingUser=await User.findOne({email}).then((user)=>{
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

export {registerUser}