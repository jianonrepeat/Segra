'use client';

import React, {useRef, useState, useEffect} from "react";
import {Content} from '../Models/types';
import {sendMessageToBackend} from '../Utils/MessageUtils';
import {useSettings} from "../Context/SettingsContext";

interface VideoProps {
	video: Content;
}

interface Selection {
	id: number;
	startTime: number;
	endTime: number;
}

export default function VideoComponent({video}: VideoProps) {
	const {state} = useSettings();

	const videoRef = useRef<HTMLVideoElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [zoom, setZoom] = useState(1);
	const [isDragging, setIsDragging] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [containerWidth, setContainerWidth] = useState(0);
	const [selections, setSelections] = useState<Selection[]>([]);
	const [draggedSelectionId, setDraggedSelectionId] = useState<number | null>(null);
	const [resizingSelectionId, setResizingSelectionId] = useState<number | null>(null);
	const [resizeDirection, setResizeDirection] = useState<'start' | 'end' | null>(null);
	const [isInteracting, setIsInteracting] = useState(false);
	const [selectionDragOffset, setSelectionDragOffset] = useState<number>(0);

	useEffect(() => {
		const videoElement = videoRef.current;
		if (!videoElement) return;

		const setVideoDuration = () => {
			setDuration(videoElement.duration);
			setZoom(1);
		};

		videoElement.addEventListener("loadedmetadata", setVideoDuration);

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				e.preventDefault();
				togglePlayPause();
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			videoElement.removeEventListener("loadedmetadata", setVideoDuration);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	// New useEffect for smooth marker updates
	useEffect(() => {
		const videoElement = videoRef.current;
		if (!videoElement) return;

		let animationFrameId: number;

		const updateCurrentTime = () => {
			setCurrentTime(videoElement.currentTime);
			if (!videoElement.paused && !videoElement.ended) {
				animationFrameId = requestAnimationFrame(updateCurrentTime);
			}
		};

		const onPlay = () => {
			setIsPlaying(true);
			animationFrameId = requestAnimationFrame(updateCurrentTime);
		};

		const onPause = () => {
			setIsPlaying(false);
			cancelAnimationFrame(animationFrameId);
		};

		videoElement.addEventListener('play', onPlay);
		videoElement.addEventListener('pause', onPause);

		// If video is already playing when component mounts, start updating
		if (!videoElement.paused) {
			onPlay();
		}

		return () => {
			videoElement.removeEventListener('play', onPlay);
			videoElement.removeEventListener('pause', onPause);
			cancelAnimationFrame(animationFrameId);
		};
	}, []);

	useEffect(() => {
		if (scrollContainerRef.current) {
			setContainerWidth(scrollContainerRef.current.clientWidth);
		}

		const handleResize = () => {
			if (scrollContainerRef.current) {
				setContainerWidth(scrollContainerRef.current.clientWidth);
			}
		};

		window.addEventListener("resize", handleResize);

		return () => window.removeEventListener("resize", handleResize);
	}, []);

	const togglePlayPause = () => {
		const videoElement = videoRef.current;
		if (!videoElement) return;

		if (videoElement.paused) {
			videoElement.play();
		} else {
			videoElement.pause();
		}
	};

	const basePixelsPerSecond = duration > 0 ? containerWidth / duration : 0;
	const pixelsPerSecond = basePixelsPerSecond * zoom;

	const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (isInteracting) return;

		const rect = scrollContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const clickPosition = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
		const newTime = clickPosition / pixelsPerSecond;

		const clampedTime = Math.max(0, Math.min(newTime, duration));
		setCurrentTime(clampedTime);

		if (videoRef.current) {
			videoRef.current.currentTime = clampedTime;
		}
	};

	const handleZoom = (e: React.WheelEvent<HTMLDivElement>) => {
		e.preventDefault();

		if (duration === 0) return;

		const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
		const newZoom = Math.min(Math.max(zoom * zoomFactor, 1), 10);

		const rect = scrollContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const cursorPosition = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
		const timeAtCursor = cursorPosition / pixelsPerSecond;

		setZoom(newZoom);

		const newPixelsPerSecond = basePixelsPerSecond * newZoom;
		const newScrollLeft = timeAtCursor * newPixelsPerSecond - (e.clientX - rect.left);

		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollLeft = newScrollLeft;
		}
	};

	const handleMarkerDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
		setIsDragging(true);
		setIsInteracting(true);
	};

	const handleMarkerDrag = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!isDragging) return;

		const rect = scrollContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const dragPosition = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
		const newTime = dragPosition / pixelsPerSecond;

		setCurrentTime(Math.max(0, Math.min(newTime, duration)));
		if (videoRef.current) {
			videoRef.current.currentTime = newTime;
		}
	};

	const handleMarkerDragEnd = () => {
		setIsDragging(false);
		setTimeout(() => {
			setIsInteracting(false);
		}, 0);
	};

	const formatTime = (time: number) => {
		const minutes = Math.floor(time / 60);
		const seconds = Math.floor(time % 60).toString().padStart(2, "0");
		return `${minutes}:${seconds}`;
	};

	const generateTicks = () => {
		const maxTicks = 10;
		const minTickSpacing = 50;

		const totalPixels = duration * pixelsPerSecond;

		let majorTickInterval = Math.ceil(duration / maxTicks);

		let approxTickSpacing = totalPixels / (duration / majorTickInterval);
		while (approxTickSpacing < minTickSpacing) {
			majorTickInterval *= 2;
			approxTickSpacing = totalPixels / (duration / majorTickInterval);
		}

		const majorTicks = [];
		for (let tickTime = majorTickInterval; tickTime < duration; tickTime += majorTickInterval) {
			majorTicks.push(tickTime);
		}

		const minorTicks = [];
		const minorTicksPerMajor = 9;
		const minorTickInterval = majorTickInterval / minorTicksPerMajor;

		for (let tickTime = minorTickInterval; tickTime < duration; tickTime += minorTickInterval) {
			if (tickTime % majorTickInterval === 0) continue;
			minorTicks.push(tickTime);
		}

		return {majorTicks, minorTicks};
	};

	const {majorTicks, minorTicks} = generateTicks();

	const handleAddSelection = () => {
		const newSelection: Selection = {
			id: Date.now(),
			startTime: currentTime,
			endTime: currentTime + 5 > duration ? duration : currentTime + 5,
		};
		setSelections((prevSelections) => [...prevSelections, newSelection]);
	};

	const handleCreateClip = () => {
		const parameters: any = {
			FileName: video.fileName,
			Game: video.game,
			Selections: selections.map((selection) => ({
				startTime: selection.startTime,
				endTime: selection.endTime,
			})),
		};

		sendMessageToBackend("CreateClip", parameters);
	};

	const handleSelectionDragStart = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
		e.stopPropagation();
		setDraggedSelectionId(id);
		setIsInteracting(true);

		const rect = scrollContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const dragPosition = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
		const cursorTime = dragPosition / pixelsPerSecond;

		const selection = selections.find((sel) => sel.id === id);
		if (!selection) return;

		const offset = cursorTime - selection.startTime;
		setSelectionDragOffset(offset);
	};

	const handleSelectionDrag = (e: React.MouseEvent<HTMLDivElement>) => {
		if (draggedSelectionId === null) return;

		const rect = scrollContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const dragPosition = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
		const cursorTime = dragPosition / pixelsPerSecond;

		const videoDuration = videoRef.current?.duration || duration;

		setSelections((prevSelections) =>
			prevSelections.map((selection) => {
				if (selection.id === draggedSelectionId) {
					const selectionDuration = selection.endTime - selection.startTime;

					let newStart = cursorTime - selectionDragOffset;

					newStart = Math.max(0, Math.min(newStart, videoDuration - selectionDuration));

					const newEnd = newStart + selectionDuration;

					return {...selection, startTime: newStart, endTime: newEnd};
				}
				return selection;
			})
		);
	};

	const handleSelectionDragEnd = () => {
		setDraggedSelectionId(null);
		setTimeout(() => {
			setIsInteracting(false);
		}, 0);
	};

	const handleResizeStart = (
		e: React.MouseEvent<HTMLDivElement>,
		id: number,
		direction: 'start' | 'end'
	) => {
		e.stopPropagation();
		setResizingSelectionId(id);
		setResizeDirection(direction);
		setIsInteracting(true);
	};

	const handleSelectionResize = (e: React.MouseEvent<HTMLDivElement>) => {
		if (resizingSelectionId === null || resizeDirection === null) return;

		const rect = scrollContainerRef.current?.getBoundingClientRect();
		if (!rect) return;

		const position = e.clientX - rect.left + scrollContainerRef.current!.scrollLeft;
		const time = position / pixelsPerSecond;

		setSelections((prevSelections) =>
			prevSelections.map((selection) => {
				if (selection.id === resizingSelectionId) {
					if (resizeDirection === 'start') {
						const newStartTime = Math.max(0, Math.min(time, selection.endTime - 0.1));
						return {...selection, startTime: newStartTime};
					} else {
						const newEndTime = Math.min(duration, Math.max(time, selection.startTime + 0.1));
						return {...selection, endTime: newEndTime};
					}
				}
				return selection;
			})
		);
	};

	const handleSelectionResizeEnd = () => {
		setResizingSelectionId(null);
		setResizeDirection(null);
		setTimeout(() => {
			setIsInteracting(false);
		}, 0);
	};

	const handleSelectionContextMenu = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
		e.preventDefault();
		setSelections((prevSelections) => prevSelections.filter((sel) => sel.id !== id));
	};

	const sortedSelections = [...selections].sort((a, b) => a.startTime - b.startTime);

	return (
		<div ref={containerRef}>
			<div className="aspect-w-16 aspect-h-9 px-2 bg-black">
				<video
					autoPlay
					className="w-full h-full"
					style={{maxHeight: '71.3vh'}}
					src={`/api/content?fileName=${encodeURIComponent(video.fileName)}&type=${video.type.toLocaleLowerCase()}`}
					ref={videoRef}
					// Removed onPlay and onPause handlers here since they are now in useEffect
					onClick={togglePlayPause}
				>
					Your browser does not support the video tag.
				</video>
			</div>
			<div
				className="timeline-wrapper"
				style={{
					position: 'relative',
					overflowX: 'scroll',
					overflowY: 'hidden',
					width: '100%',
					userSelect: 'none',
				}}
				onWheel={handleZoom}
				ref={scrollContainerRef}
				onMouseMove={(e) => {
					handleSelectionDrag(e);
					handleSelectionResize(e);
					handleMarkerDrag(e);
				}}
				onMouseUp={() => {
					handleSelectionDragEnd();
					handleSelectionResizeEnd();
					handleMarkerDragEnd();
				}}
				onMouseLeave={() => {
					handleSelectionDragEnd();
					handleSelectionResizeEnd();
					handleMarkerDragEnd();
				}}
			>
				<div
					className="ticks-container"
					style={{
						position: 'relative',
						height: '40px',
						width: `${duration * pixelsPerSecond}px`,
						minWidth: '100%',
						overflow: 'visible',
					}}
				>
					{minorTicks.map((tickTime, index) => {
						if (tickTime >= duration) return null;

						const leftPosition = tickTime * pixelsPerSecond;

						if (leftPosition > containerWidth * zoom) return null;

						return (
							<div
								key={`minor-${index}`}
								style={{
									position: 'absolute',
									left: `${leftPosition}px`,
									bottom: '0',
									height: '6px',
									borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
								}}
							></div>
						);
					})}

					{majorTicks.map((tickTime, index) => {
						if (tickTime > duration) return null;

						const leftPosition = tickTime * pixelsPerSecond;

						if (leftPosition > containerWidth * zoom) return null;

						return (
							<div
								key={`major-${index}`}
								style={{
									position: 'absolute',
									bottom: 0,
									left: `${leftPosition}px`,
									textAlign: 'center',
									color: '#fff',
									userSelect: 'none',
									transform: 'translateX(-50%)',
									whiteSpace: 'nowrap',
								}}
							>
								<span
									style={{
										position: 'absolute',
										bottom: '100%',
										left: '50%',
										transform: 'translateX(-50%)',
										fontSize: '12px',
										marginBottom: '3px',
									}}
								>
									{formatTime(tickTime)}
								</span>
								<div
									style={{
										width: '2px',
										height: '10px',
										backgroundColor: '#fff',
										margin: '0 auto',
									}}
								></div>
							</div>
						);
					})}
				</div>

				<div
					className="timeline-container"
					style={{
						position: 'relative',
						height: '50px',
						width: `${duration * pixelsPerSecond}px`,
						minWidth: '100%',
						backgroundColor: '#2a2a2a',
						borderRadius: '10px',
						overflow: 'hidden',
						cursor: 'pointer',
					}}
					onClick={handleTimelineClick}
				>
					{sortedSelections.map((selection) => {
						const left = selection.startTime * pixelsPerSecond;
						const width = (selection.endTime - selection.startTime) * pixelsPerSecond;

						return (
							<div
								key={selection.id}
								style={{
									position: 'absolute',
									top: '0',
									left: `${left}px`,
									width: `${width}px`,
									height: '100%',
									backgroundColor: 'oklch(var(--in))',
									cursor: 'move',
									border: '1px solid #0080ff',
									overflow: 'hidden',
								}}
								onMouseDown={(e) => handleSelectionDragStart(e, selection.id)}
								onContextMenu={(e) => handleSelectionContextMenu(e, selection.id)}
							>
								<div
									style={{
										position: 'absolute',
										top: '0',
										left: '0',
										right: '0',
										textAlign: 'center',
										color: '#fff',
										fontSize: '12px',
										userSelect: 'none',
										paddingTop: '2px',
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
									}}
								>
									{formatTime(selection.startTime)} - {formatTime(selection.endTime)}
								</div>

								<div
									style={{
										position: 'absolute',
										top: 0,
										left: '-7px',
										width: '17px',
										height: '100%',
										backgroundColor: 'transparent',
										cursor: 'col-resize',
									}}
									onMouseDown={(e) => handleResizeStart(e, selection.id, 'start')}
								></div>
								<div
									style={{
										position: 'absolute',
										top: 0,
										right: '-7px',
										width: '17px',
										height: '100%',
										backgroundColor: 'transparent',
										cursor: 'col-resize',
									}}
									onMouseDown={(e) => handleResizeStart(e, selection.id, 'end')}
								></div>
							</div>
						);
					})}

					<div
						className="marker"
						style={{
							position: "absolute",
							top: 0,
							left: `${currentTime * pixelsPerSecond}px`,
							width: "4px",
							height: "100%",
							backgroundColor: "oklch(var(--p))",
							transform: "translateX(-50%)",
							cursor: 'pointer',
							borderRadius: "8px",
						}}
						onMouseDown={handleMarkerDragStart}
					></div>
				</div>
			</div>
			{video.type == 'Video' && (
				<div className="mt-2">
					<button
						className="btn btn-primary mr-2"
						disabled={state.isCreatingClip}
						onClick={handleCreateClip}
					>
						Create Clip
						{state.isCreatingClip && (
							<span className="loading loading-spinner loading-xs"></span>
						)}
					</button>
					<button className="btn btn-secondary" onClick={handleAddSelection}>
						Add Selection
					</button>
				</div>
			)}
		</div>
	);
}
