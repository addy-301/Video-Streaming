import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    //TODO: get all videos based on query, sort, pagination
    const pipeline = []
    if(query){
        pipeline.push({
            $search:{
                index: 'search-videos',
                text:{
                    query: query,
                    path: ["title", "description"]
                }
            }
        })
    }
    if(userId){
        if(!isValidObjectId(userId)) 
            throw new ApiError(400, "Invalid user ID")
        pipeline.push({
            $match:{
                owner: new mongoose.Types.ObjectId(userId)
            }
        })
    }
    pipeline.push({
        $match:{
            isPublished: true
        }
    })
    if(sortBy&&sortType){
        pipeline.push({
            $sort:{
                [sortBy]: sortType==="asc" ? 1 : -1
            }
        })
    }
    else{
        pipeline.push({
            $sort:{
                createdAt: -1
            }
        })
    }
    pipeline.push({
        $lookup:{
            from: 'users',
            localField: 'owner',
            foreignField: '_id',
            as: 'ownerDetails',
            pipeline: [
                {
                    $project:{
                        username: 1,
                        'avatar.url': 1,
                    }
                }
            ]
        }
    },
        {
            $unwind: "$ownerDetails"
        }
    )
    const totalVideos=await Video.aggregate(pipeline)
    const options={
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    }
    const videos=await Video.aggregatePaginate(totalVideos, options)
    return res.status(200).json(new ApiResponse(200, videos, "Videos fetched successfully"))
})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    // TODO: get video, upload to cloudinary, create video
    if (!title || !description) 
        throw new ApiError(400, "Title and description are required")
    const videoFileLocalPath = req.file?.videoFile[0].path
    const thumbnailLocalPath = req.file?.thumbnail[0].path
    if (!videoFileLocalPath)
        throw new ApiError(400, "Video file is required")
    if (!thumbnailLocalPath)
        throw new ApiError(400, "Thumbnail is required")
    const videoFile=await uploadOnCloudinary(videoFileLocalPath)
    if (!videoFile) 
        throw new ApiError(500, "Failed to upload video file")
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    if (!thumbnail) 
        throw new ApiError(500, "Failed to upload thumbnail")
    const video = await Video.create({
        title,
        description,
        duration: videoFile.duration,
        videoFile: {
            public_id: videoFile.public_id,
            url: videoFile.url
        },
        thumbnail: {
            public_id: thumbnail.public_id,
            url: thumbnail.url
        },
        owner: req.user?._id,
        isPublished: false
    })
    const uploadVideo=await Video.findById(video._id)
    if(!uploadVideo) 
        throw new ApiError(500, "Failed to create video")
    return res.status(201).json(new ApiResponse(201, uploadVideo, "Video uploaded successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
    if (!isValidObjectId(videoId)) 
        throw new ApiError(400, "Invalid video ID")
    if(!isValidObjectId(req.user?._id)) 
        throw new ApiError(400, "Invalid user ID")
    const video=await Video.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(videoId),
            }
        },
        {
            $lookup:{
                from: "likes",
                localField: "_id",
                foreignField: "video",
                as: "likes"
            }
        },
        {
            $lookup:{
                from: 'users',
                localField: 'owner',
                foreignField: '_id',
                as: 'owner',
                pipeline: [
                    {
                        $lookup:{
                            from:'subscriptions',
                            localField: '_id',
                            foreignField: 'channel',
                            as: 'subscribers',
                        }
                    },
                    {
                        $addFields:{
                            subscriberCount:{
                                $size: "$subscribers"
                            },
                            isSubcscribed:{
                                $cond:{
                                    if:{
                                        $in: [req.user?._id, "$subscribers.subscriber"]
                                    },
                                    then: true,
                                    else: false
                                }
                            }
                        }
                    },
                    {
                        $project:{
                            username: 1,
                            'avatar.url': 1,
                            subscriberCount: 1,
                            isSubcscribed: 1
                        }
                    }
                ]
            }
        },
        {
            $addFields:{
                likesCount:{
                    $size: "$likes"
                },
                owner:{
                    $first: "$owner"
                },
                isLiked:{
                    $cond:{
                        if:{
                            $in: [req.user?._id, "$likes.likedBy"]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project:{
                'videoFile.url': 1,
                title: 1,
                description: 1,
                views: 1,
                duration: 1,
                createdAt: 1,
                comments: 1,
                isLiked: 1,
                likesCount: 1,
                owner: 1,
            }
        }
    ])
    if(!video)
        throw new ApiError(404, "Video not found")
    await findByIdAndUpdate(videoId, {
        $inc:{
            views: 1
        }
    })
    await User.findByIdAndUpdate(req.user?._id, {
        $addToSet:{
            watchHistory: videoId
        }
    })
    return res.status(200).json(new ApiResponse(200, video, "Video fetched successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const { title, description} = req.body
    //TODO: update video details like title, description, thumbnail
    if (!isValidObjectId(videoId)) 
        throw new ApiError(400, "Invalid video ID")
    if (!title || !description) 
        throw new ApiError(400, "Title and description are required")
    const video = await Video.findById(videoId)
    if (!video)
        throw new ApiError(404, "Video not found")
    if(video?.owner.toString()!==req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to perform this action")
    const deleteThumbnail=video.thumbnail.public_id
    const thumbnailLocalPath=req.file?.path
    if(!thumbnailLocalPath) 
        throw new ApiError(400, "Thumbnail is required")
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath, 'thumbnail')
    if (!thumbnail) 
        throw new ApiError(500, "Failed to upload thumbnail")
    const updatedVideo = await Video.findByIdAndUpdate(videoId, {
        $set: {
            title,
            description,
            thumbnail:{
                public_id: thumbnail.public_id,
                url: thumbnail.url
            }
        }
    }, { new: true })
    if (!updatedVideo)
        throw new ApiError(500, "Failed to update video")
    if(updatedVideo)
        await deleteOnCloudinary(deleteThumbnail)
    return res.status(200).json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
    if (!isValidObjectId(videoId)) 
        throw new ApiError(400, "Invalid video ID")
    const video = await Video.findById(videoId)
    if (!video) 
        throw new ApiError(404, "Video not found")
    if(video?.owner.toString()!==req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to perform this action")
    const deletedVideo = await Video.findByIdAndDelete(video?._id)
    if (!deletedVideo) 
        throw new ApiError(500, "Failed to delete video")
    await deleteOnCloudinary(video.thumbnail.public_id)
    await deleteOnCloudinary(video.videoFile.public_id, 'video')
    await Like.deleteMany({ video: videoId })
    await Comment.deleteMany({ video: videoId })
    return res.status(200).json(new ApiResponse(200, deletedVideo, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    if (!isValidObjectId(videoId)) 
        throw new ApiError(400, "Invalid video ID")
    const video=await Video.findById(videoId)
    if (!video) 
        throw new ApiError(404, "Video not found")
    if(video?.owner.toString()!==req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to perform this action")
    const toggleVideo = await Video.findByIdAndUpdate(videoId, {
        $set:{
            isPublished: !video?.isPublished
        }
    }, {new: true})
    if(!toggleVideo) 
        throw new ApiError(500, "Failed to toggle video publish status")
    return res.status(200).json(new ApiResponse(200, toggleVideo, "Video publish status toggled successfully"))
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}