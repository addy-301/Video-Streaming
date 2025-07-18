import mongoose, {isValidObjectId} from "mongoose"
import {Playlist} from "../models/playlist.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { Video } from "../models/video.model.js"


const createPlaylist = asyncHandler(async (req, res) => {
    const {name, description} = req.body

    //TODO: create playlist
    if(!name||!description) 
        throw new ApiError(400, "Name and description are required")
    const playlist=await Playlist.create({
        name,
        description,
        owner: req.user?._id
    })
    if(!playlist) 
        throw new ApiError(500, "Failed to create playlist")
    return res.status(201).json(new ApiResponse(201, playlist, "Playlist created successfully"))
})

const getUserPlaylists = asyncHandler(async (req, res) => {
    const {userId} = req.params
    //TODO: get user playlists
    if(!isValidObjectId(userId)) 
        throw new ApiError(400, "Invalid user ID")
    const playlists=await Playlist.aggregate([
        {
            $match:{
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup:{
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
        {
            $addFields:{
                totalVideos: {
                    $size: "$videos"
                },
                totalViews:{
                    $sum: "$videos.views"
                }
            }
        },
        {
            $project:{
                _id: 1,
                name: 1,
                description: 1,
                totalVideos: 1,
                totalViews: 1,
                updatedAt: 1
            }
        }
    ])
    return res.status(200).json(new ApiResponse(200, playlists, "User playlists fetched successfully"))
})

const getPlaylistById = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    //TODO: get playlist by id
    if(!isValidObjectId(playlistId)) 
        throw new ApiError(400, "Invalid playlist ID")
    const playlist = await Playlist.findById(playlistId)
    if(!playlist)
        throw new ApiError(404, "Playlist not found")
    const playlistVideos=await Playlist.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(playlistId)
            }
        },
        {
            $lookup:{
                from: "videos",
                localField: "videos",
                foreignField: "_id",
                as: "videos"
            }
        },
        {
            $match:{
                'video.isPublished': true
            }
        },
        {
            $lookup:{
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner"
            }
        },
        {
            $addFields:{
                totalVideos:{
                    $size: "$videos"
                },
                totalViews:{
                    $sum: "$videos.views"
                },
                owner:{
                    $first: "$owner"
                }
            }
        },
        {
            $project:{
                name: 1,
                description: 1,
                createdAt: 1,
                updatedAt: 1,
                totalVideos: 1,
                totalViews: 1,
                videos:{
                    _id: 1, 
                    'videoFile.url': 1,
                    'thumbnail.url': 1,
                    title: 1,
                    description: 1,
                    duration: 1,
                    views: 1,
                    createdAt: 1,
                },
                owner:{
                    username: 1,
                    fullName: 1,
                    'avatar.url': 1
                }
            }
        }
    ])
    return res.status(200).json(new ApiResponse(200, playlistVideos, "Playlist fetched successfully"))
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params
    if(!isValidObjectId(playlistId)) 
        throw new ApiError(400, "Invalid playlist ID")
    if(!isValidObjectId(videoId)) 
        throw new ApiError(400, "Invalid video ID")
    const playlist = await Playlist.findById(playlistId)
    const video=await Video.findById(videoId)
    if(!playlist)
        throw new ApiError(404, "Playlist not found")
    if(!video)
        throw new ApiError(404, "Video not found")
    if(playlist.owner?.toString()&&video.owner?.toString() !== req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to add video to this playlist")
    const updatePlaylist=await Playlist.findByIdAndUpdate(playlist?._id, {
        $addToset:{
            videos: videoId
        }
    }, {new: true})
    if(!updatePlaylist) 
        throw new ApiError(500, "Failed to add video to playlist")
    return res.status(200).json(new ApiResponse(200, updatePlaylist, "Video added to playlist successfully"))
})

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const {playlistId, videoId} = req.params
    // TODO: remove video from playlist
    if(!isValidObjectId(playlistId)) 
        throw new ApiError(400, "Invalid playlist ID")
    if(!isValidObjectId(videoId))
        throw new ApiError(400, "Invalid video ID")
    const playlist = await Playlist.findById(playlistId)
    const video = await Video.findById(videoId)
    if(!playlist) 
        throw new ApiError(404, "Playlist not found")
    if(!video) 
        throw new ApiError(404, "Video not found")
    if(playlist.owner?.toString()&&video.owner.ToString() !== req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to remove video from this playlist")
    const updatedPlaylist = await Playlist.findByIdAndUpdate(playlist?._id, {
        $pull: {
            videos: videoId
        }
    }, {new: true})
    return res.status(200).json(new ApiResponse(200, updatedPlaylist, "Video removed from playlist successfully"))
})

const deletePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    // TODO: delete playlist
    if(!isValidObjectId(playlistId)) 
        throw new ApiError(400, "Invalid playlist ID")
    const playlist = await Playlist.findById(playlistId)
    if(!playlist) 
        throw new ApiError(404, "Playlist not found")
    if(playlist.owner.toString() !== req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to delete this playlist")
    await Playlist.findByIdAndDelete(playlist?._id)
    return res.status(200).json(new ApiResponse(200, {}, "Playlist deleted successfully"))
})

const updatePlaylist = asyncHandler(async (req, res) => {
    const {playlistId} = req.params
    const {name, description} = req.body
    //TODO: update playlist
    if(!isValidObjectId(playlistId)) 
        throw new ApiError(400, "Invalid playlist ID")
    if(!name || !description)
        throw new ApiError(400, "Name and description are required")
    const playlist = await Playlist.findById(playlistId)
    if(!playlist) 
        throw new ApiError(404, "Playlist not found")
    if(playlist.owner.toString() !== req.user?._id.toString())
        throw new ApiError(403, "You are not authorized to update this playlist")
    const updatedPlaylist = await Playlist.findByIdAndUpdate(playlist?._id, {
        $set:{
            name, 
            description
        }
    }, {new: true})
    return res.status(200).json(new ApiResponse(200, updatedPlaylist, "Playlist updated successfully"))
})

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist
}