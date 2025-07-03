import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"


const toggleSubscription = asyncHandler(async (req, res) => {
    const {channelId} = req.params
    // TODO: toggle subscription
    if(!isValidObjectId(channelId))
        throw new ApiError(400, "Invalid channel ID")
    const isSub=await Subscription.findOne({
        subscriber: req.user?._id,
        channel: channelId
    })
    if(isSub){
        await Subscription.findByIdAndDelete(isSub?._id)
        return res.status(200).json(new ApiResponse(200, {subscribed: false}, "Unsubscribed successfully"))
    }
    await Subscription.create({
        subscriber: req.user?._id,
        channel: channelId
    })
    return res.status(201).json(new ApiResponse(201, {subscribed: true}, "Subscribed successfully"))
})

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const {channelId} = req.params
    if(!isValidObjectId(channelId))
        throw new ApiError(400, "Invalid channel ID")
    channelId = mongoose.Types.ObjectId(channelId)
    const subs=await Subscription.aggregate([
        {
            $match:{
                channel: channelId
            }
        },
        {
            $lookup:{
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
                pipeline: [
                    {
                        $lookup:{
                            from: 'subscriptions',
                            localField: '_id',
                            foreignField: 'channel',
                            as: 'subscribedTo',
                        }
                    },
                    {
                        $addFields:{
                            subscribedTo:{
                                $cond:{
                                    if: {$in: [channelId, "$subscribedTo.subscriber"]},
                                    then: true,
                                    else: false
                                }
                            },
                            subscriberCount:{
                                $size: "$subscribedTo"
                            }
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$subscriber"
        },
        {
            $project:{
                _id: 0,
                subscriber:{
                    _id: 1, 
                    username: 1,
                    fullName: 1,
                    'avatar.url': 1,
                    subscribedTo: 1,
                    subscriberCount: 1
                }
            }
        }
    ])
    return res.status(200).json(new ApiResponse(200, {subscribers: subs}, "Subscribers fetched successfully"))
})

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params
    if(!isValidObjectId(subscriberId))
        throw new ApiError(400, "Invalid subscriber ID")
    const subChannels=await Subscription.aggregate([
        {
            $match:{
                subscriber: mongoose.Types.ObjectId(subscriberId)
            }
        },
        {
            $lookup:{
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "subChannel",
                pipeline:[
                    {
                        $lookup:{
                            from: 'videos',
                            localField: '_id',
                            foreignField: 'owner',
                            as: 'videos',
                        }
                    },
                    {
                        $addFields:{
                            latestVide:{
                                $last: '$videos'
                            }
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$subChannel"
        },
        {
            $project:{
                _id: 0,
                subChannel:{
                    _id: 1,
                    username: 1,
                    fullName: 1,
                    'avatar.url': 1,
                    latestVideo: {
                        _id: 1,
                       'videoFile.url': 1,
                       'thumbnail.url': 1,
                        title: 1,
                        owner: 1,
                        description: 1,
                        duration: 1,
                        createdAt: 1,
                        views: 1
                    }
                }
            }
        }
    ])
    return res.status(200).json(new ApiResponse(200, {subscribedChannels: subChannels}, "Subscribed channels fetched successfully"))
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}