import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createTweet = asyncHandler(async (req, res) => {
    //TODO: create tweet
    const {content} =req.body;
    if(!content)
        throw new ApiError(400, "Content is required");
    const tweet = await Tweet.create({
        content,
        user: req.user?._id
    });
    if(!tweet)
        throw new ApiError(500, "Failed to create tweet");
    return res.status(201).json(new ApiResponse(201, tweet, "Tweet created successfully"));

})

const getUserTweets = asyncHandler(async (req, res) => {
    // TODO: get user tweets
    const {user}=req.params;
    if(!isValidObjectId(userId))
        throw new ApiError(400, "Invalid user ID");
    const tweets=await Tweet.aggregate([
        {
            $match:{
                owner: new mongoose.Types.ObjectId(user)
            }
        },
        {
            $lookup:{
                from: 'users',
                localField: 'owner', 
                foreignField: '_id',
                as: 'ownerDetails',
                pipeline:[
                    {
                        $project:{
                            username: 1,
                            'avatar.url': 1
                        }
                    }
                ]
            }
        },
        {
            $lookup:{
                from: 'likes',
                localField: '_id',
                foreignField: 'tweet',
                as: 'likesDetails',
                pipeline:[
                    {
                        $project:{
                            likedBy: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                likesCount: {
                    $size: "$likesDetails"
                },
                ownerDetails: {
                    $first: '$ownerDetails'
                },
                isLiked:{
                    cond:{
                        if: {
                            $in: [req.user?._id, '$likesDetails.likedBy']
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $sort:{
                createdAt: -1
            }
        },
        {
            $project:{
                content: 1,
                ownerDetails: 1,
                likesCount: 1,
                createdAt: 1,
                isLiked: 1
            }
        }
    ])
    return res.status(200).json(new ApiResponse(200, tweets, "User tweets fetched successfully"));
})

const updateTweet = asyncHandler(async (req, res) => {
    //TODO: update tweet
    const {content}=req.body;
    const {tweetId} = req.params;
    if(!content)
        throw new ApiError(400, "Content is required");
    if(!isValidObjectId(tweetId))
        throw new ApiError(400, "Invalid tweet ID");
    const tweet= await Tweet.findById(tweetId);
    if(!tweet)
        throw new ApiError(404, "Tweet not found");
    if(tweet?.owner.toString()!==req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to update this tweet");
    const newTweet= await Tweet.findByIdAndUpdate(tweetId, {
        $set:{
            content
        }
    }, {new: true});
    if(!newTweet)
        throw new ApiError(500, "Failed to update tweet");
    return res.status(200).json(new ApiResponse(200, newTweet, "Tweet updated successfully"));
})

const deleteTweet = asyncHandler(async (req, res) => {
    //TODO: delete tweet
    const {tweetId} = req.params;
    if(!isValidObjectId(tweetId))
        throw new ApiError(400, "Invalid tweet ID");
    const tweet=await Tweet.findById(tweetId);
    if(!tweet)
        throw new ApiError(404, "Tweet not found");
    if(tweet?.owner.toString()!==req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to delete this tweet");
    await Tweet.findByIdAndDelete(tweetId);
    return res.status(200).json(new ApiResponse(200, {}, "Tweet deleted successfully"));
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}