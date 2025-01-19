import React, {useRef, useState, useEffect} from "react";
import {Content} from "../Models/types";
import {sendMessageToBackend} from "../Utils/MessageUtils";
import {useSettings} from "../Context/SettingsContext";
import {useDrag, useDrop, DndProvider} from "react-dnd";
import {HTML5Backend} from "react-dnd-html5-backend";

interface Selection {
	id: number;
	startTime: number;
	endTime: number;
	thumbnailDataUrl?: string;
	isLoading: boolean;
}

interface VideoProps {
	video: Content;
}

const DRAG_TYPE = "SELECTION_CARD";

async function fetchThumbnailAtTime(videoPath: string, timeInSeconds: number): Promise<string> {
	const url = `http://localhost:2222/api/thumbnail?input=${encodeURIComponent(videoPath)}&time=${timeInSeconds}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch thumbnail: ${response.statusText}`);
	}
	const blob = await response.blob();
	return URL.createObjectURL(blob);
}

function SelectionCard({
	selection,
	index,
	moveCard,
	formatTime,
	isHovered,
	setHoveredSelectionId
}: {
	selection: Selection;
	index: number;
	moveCard: (dragIndex: number, hoverIndex: number) => void;
	formatTime: (time: number) => string;
	isHovered: boolean;
	setHoveredSelectionId: (id: number | null) => void;
}) {
	const [{isDragging}, dragRef] = useDrag(() => ({
		type: DRAG_TYPE,
		item: {index},
		collect: (monitor) => ({
			isDragging: monitor.isDragging()
		})
	}), [index]);

	const [, dropRef] = useDrop(() => ({
		accept: DRAG_TYPE,
		hover: (item: {index: number}) => {
			if (item.index !== index) {
				moveCard(item.index, index);
				item.index = index;
			}
		}
	}), [index, moveCard]);

	const dragDropRef = (node: HTMLDivElement | null) => {
		dragRef(node);
		dropRef(node);
	};

	const {startTime, endTime, thumbnailDataUrl, isLoading} = selection;
	const opacity = isDragging ? 0.3 : 1;

	return (
		<div
			ref={dragDropRef}
			className={`mb-2 cursor-move w-full relative rounded-xl ${isHovered ? "outline outline-1 outline-primary" : ""}`}
			style={{opacity}}
			onMouseEnter={() => setHoveredSelectionId(selection.id)}
			onMouseLeave={() => setHoveredSelectionId(null)}
		>
			{isLoading ? (
				<div className="flex items-center justify-center bg-base-100 bg-opacity-75 rounded-xl w-full aspect-[16/9]">
					<span className="loading loading-spinner loading-md text-white" />
					<div className="absolute bottom-2 right-2 bg-base-100 bg-opacity-75 text-white text-xs px-2 py-1 rounded">
						{formatTime(startTime)} - {formatTime(endTime)}
					</div>
				</div>
			) : thumbnailDataUrl ? (
				<figure className="relative rounded-xl overflow-hidden">
					<img src={thumbnailDataUrl} alt="Selection" className="w-full" />
					<div className="absolute bottom-2 right-2 bg-base-100 bg-opacity-75 text-white text-xs px-2 py-1 rounded">
						{formatTime(startTime)} - {formatTime(endTime)}
					</div>
				</figure>
			) : (
				<div className="h-32 bg-gray-700 flex items-center justify-center text-white">
					<span>No thumbnail</span>
				</div>
			)}
		</div>
	);
}

export default function VideoComponent({video}: VideoProps) {
	const {state, contentFolder} = useSettings();
	const videoRef = useRef<HTMLVideoElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const latestDraggedSelectionRef = useRef<Selection | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [zoom, setZoom] = useState(1);
	const [isDragging, setIsDragging] = useState(false);
	const [containerWidth, setContainerWidth] = useState(0);
	const [selections, setSelections] = useState<Selection[]>([]);
	const [resizingSelectionId, setResizingSelectionId] = useState<number | null>(null);
	const [resizeDirection, setResizeDirection] = useState<"start" | "end" | null>(null);
	const [isInteracting, setIsInteracting] = useState(false);
	const [dragState, setDragState] = useState<{id: number | null; offset: number}>({id: null, offset: 0});
	const [hoveredSelectionId, setHoveredSelectionId] = useState<number | null>(null);
	const [isHoveredByTimeline, setIsHoveredByTimeline] = useState<boolean>(false);

	const refreshSelectionThumbnail = async (selection: Selection): Promise<void> => {
		setSelections((prev) => {
			const updated = [...prev];
			const idx = updated.findIndex((s) => s.id === selection.id);
			if (idx < 0) return prev;
			updated[idx] = {...updated[idx], isLoading: true};
			return updated;
		});
		try {
			const contentFileName = `${contentFolder}/${video.type.toLowerCase()}s/${video.fileName}.mp4`;
			const thumbnailUrl = await fetchThumbnailAtTime(contentFileName, selection.startTime);
			setSelections((prev) => {
				const updated = [...prev];
				const idx = updated.findIndex((s) => s.id === selection.id);
				if (idx < 0) return prev;
				updated[idx] = {...updated[idx], thumbnailDataUrl: thumbnailUrl, isLoading: false};
				return updated;
			});
		} catch {
			setSelections((prev) => {
				const updated = [...prev];
				const idx = updated.findIndex((s) => s.id === selection.id);
				if (idx < 0) return prev;
				updated[idx] = {...updated[idx], isLoading: false};
				return updated;
			});
		}
	};

	useEffect(() => {
		const vid = videoRef.current;
		if (!vid) return;
		const onLoadedMetadata = () => {
			setDuration(vid.duration);
			setZoom(1);
		};
		vid.addEventListener("loadedmetadata", onLoadedMetadata);
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Space") {
				e.preventDefault();
				togglePlayPause();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			vid.removeEventListener("loadedmetadata", onLoadedMetadata);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	useEffect(() => {
		const vid = videoRef.current;
		if (!vid) return;
		let rafId = 0;
		const updateCurrentTime = () => {
			setCurrentTime(vid.currentTime);
			if (!vid.paused && !vid.ended) {
				rafId = requestAnimationFrame(updateCurrentTime);
			}
		};
		const onPlay = () => {
			rafId = requestAnimationFrame(updateCurrentTime);
		};
		const onPause = () => {
			cancelAnimationFrame(rafId);
		};
		vid.addEventListener("play", onPlay);
		vid.addEventListener("pause", onPause);
		if (!vid.paused) onPlay();
		return () => {
			vid.removeEventListener("play", onPlay);
			vid.removeEventListener("pause", onPause);
			cancelAnimationFrame(rafId);
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
		return () => {
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (duration === 0) return;
			const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
			const newZoom = Math.min(Math.max(zoom * zoomFactor, 1), 10);
			const rect = container.getBoundingClientRect();
			const cursorX = e.clientX - rect.left + container.scrollLeft;
			const basePixelsPerSecond = duration > 0 ? containerWidth / duration : 0;
			const oldPixelsPerSecond = basePixelsPerSecond * zoom;
			const timeAtCursor = cursorX / oldPixelsPerSecond;
			setZoom(newZoom);
			const newPPS = basePixelsPerSecond * newZoom;
			const newScrollLeft = timeAtCursor * newPPS - (e.clientX - rect.left);
			container.scrollLeft = newScrollLeft;
		};
		container.addEventListener("wheel", handleWheel, {passive: false});
		return () => {
			container.removeEventListener("wheel", handleWheel, {passive: false});
		};
	}, [zoom, duration, containerWidth]);

	const togglePlayPause = () => {
		const vid = videoRef.current;
		if (!vid) return;
		if (vid.paused) {
			vid.play();
		} else {
			vid.pause();
		}
	};

	const basePixelsPerSecond = duration > 0 ? containerWidth / duration : 0;
	const pixelsPerSecond = basePixelsPerSecond * zoom;

	const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (isInteracting || !scrollContainerRef.current) return;
		const rect = scrollContainerRef.current.getBoundingClientRect();
		const clickPos = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
		const newTime = clickPos / pixelsPerSecond;
		const clampedTime = Math.max(0, Math.min(newTime, duration));
		setCurrentTime(clampedTime);
		if (videoRef.current) {
			videoRef.current.currentTime = clampedTime;
		}
	};

	const handleMarkerDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
		setIsDragging(true);
		setIsInteracting(true);
	};

	const handleMarkerDrag = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!isDragging || !scrollContainerRef.current) return;
		const rect = scrollContainerRef.current.getBoundingClientRect();
		const dragPos = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
		const newTime = dragPos / pixelsPerSecond;
		setCurrentTime(Math.max(0, Math.min(newTime, duration)));
		if (videoRef.current) {
			videoRef.current.currentTime = newTime;
		}
	};

	const handleMarkerDragEnd = () => {
		setIsDragging(false);
		setTimeout(() => setIsInteracting(false), 0);
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
		const majorTicks: number[] = [];
		for (let t = majorTickInterval; t < duration; t += majorTickInterval) {
			majorTicks.push(t);
		}
		const minorTicks: number[] = [];
		const minorTicksPerMajor = 9;
		const minorInterval = majorTickInterval / minorTicksPerMajor;
		for (let t = minorInterval; t < duration; t += minorInterval) {
			if (Math.abs(t % majorTickInterval) < 0.0001) continue;
			minorTicks.push(t);
		}
		return {majorTicks, minorTicks};
	};

	const {majorTicks, minorTicks} = generateTicks();

	const handleAddSelection = async () => {
		if (!videoRef.current) return;
		const start = currentTime;
		const end = Math.min(currentTime + 10, duration);
		const newSelection: Selection = {
			id: Date.now(),
			startTime: start,
			endTime: end,
			thumbnailDataUrl: undefined,
			isLoading: true
		};
		setSelections((prev) => [...prev, newSelection]);
		try {
			const contentFileName = `${contentFolder}/${video.type.toLowerCase()}s/${video.fileName}.mp4`;
			const thumbnailUrl = await fetchThumbnailAtTime(contentFileName, start);
			setSelections((prev) =>
				prev.map((sel) =>
					sel.id === newSelection.id ? {...sel, thumbnailDataUrl: thumbnailUrl, isLoading: false} : sel
				)
			);
		} catch {
			setSelections((prev) =>
				prev.map((sel) => (sel.id === newSelection.id ? {...sel, isLoading: false} : sel))
			);
		}
	};

	const handleCreateClip = () => {
		const params = {
			FileName: video.fileName,
			Game: video.game,
			Selections: selections.map((s) => ({startTime: s.startTime, endTime: s.endTime}))
		};
		sendMessageToBackend("CreateClip", params);
	};

	const handleSelectionDragStart = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
		e.stopPropagation();
		if (!scrollContainerRef.current) return;
		const rect = scrollContainerRef.current.getBoundingClientRect();
		const dragPos = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
		const cursorTime = dragPos / pixelsPerSecond;
		const sel = selections.find((s) => s.id === id);
		if (sel) {
			setDragState({id, offset: cursorTime - sel.startTime});
			setIsInteracting(true);
		}
	};

	const handleSelectionDrag = (e: React.MouseEvent<HTMLDivElement>) => {
		if (dragState.id == null || !scrollContainerRef.current) return;
		const rect = scrollContainerRef.current.getBoundingClientRect();
		const dragPos = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
		const cursorTime = dragPos / pixelsPerSecond;
		setSelections((prev) => {
			const newSelections = [...prev];
			const index = newSelections.findIndex((s) => s.id === dragState.id);
			if (index >= 0) {
				const sel = newSelections[index];
				const segLength = sel.endTime - sel.startTime;
				let newStart = cursorTime - dragState.offset;
				newStart = Math.max(0, Math.min(newStart, duration - segLength));
				newSelections[index] = {...sel, startTime: newStart, endTime: newStart + segLength};
				latestDraggedSelectionRef.current = newSelections[index];
			}
			return newSelections;
		});
	};

	const handleSelectionDragEnd = async () => {
		const draggedId = dragState.id;
		setDragState({id: null, offset: 0});
		setTimeout(() => setIsInteracting(false), 0);
		if (draggedId != null && latestDraggedSelectionRef.current) {
			await refreshSelectionThumbnail(latestDraggedSelectionRef.current);
			latestDraggedSelectionRef.current = null;
		}
	};

	useEffect(() => {
		const handleGlobalMouseUp = async () => {
			handleMarkerDragEnd();
			if (dragState.id !== null) {
				await handleSelectionDragEnd();
			}
			if (resizingSelectionId !== null) {
				await handleSelectionResizeEnd();
			}

		};
		window.addEventListener("mouseup", handleGlobalMouseUp);
		return () => {
			window.removeEventListener("mouseup", handleGlobalMouseUp);
		};
	}, [dragState.id, resizingSelectionId]);

	const handleResizeStart = (
		e: React.MouseEvent<HTMLDivElement>,
		id: number,
		direction: "start" | "end"
	) => {
		e.stopPropagation();
		setResizingSelectionId(id);
		setResizeDirection(direction);
		setIsInteracting(true);
	};

	const handleSelectionResize = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!scrollContainerRef.current || resizingSelectionId == null || !resizeDirection) return;
		const rect = scrollContainerRef.current.getBoundingClientRect();
		const pos = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
		const t = pos / pixelsPerSecond;
		setSelections((prev) =>
			prev.map((sel) => {
				if (sel.id !== resizingSelectionId) return sel;
				if (resizeDirection === "start") {
					const newStart = Math.max(0, Math.min(t, sel.endTime - 0.1));
					latestDraggedSelectionRef.current = {...sel, startTime: newStart};
					return {...sel, startTime: newStart};
				} else {
					const newEnd = Math.min(duration, Math.max(t, sel.startTime + 0.1));
					latestDraggedSelectionRef.current = {...sel, endTime: newEnd};
					return {...sel, endTime: newEnd};
				}
			})
		);
	};

	const handleSelectionResizeEnd = async () => {
		setResizingSelectionId(null);
		setResizeDirection(null);
		if (latestDraggedSelectionRef.current) {
			await refreshSelectionThumbnail(latestDraggedSelectionRef.current);
			latestDraggedSelectionRef.current = null;
		}
	};

	const handleSelectionContextMenu = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
		e.preventDefault();
		setSelections((prev) => prev.filter((s) => s.id !== id));
	};

	const sortedSelections = [...selections].sort((a, b) => a.startTime - b.startTime);

	const moveCard = (dragIndex: number, hoverIndex: number) => {
		setSelections((prev) => {
			const updated = [...prev];
			const [removed] = updated.splice(dragIndex, 1);
			updated.splice(hoverIndex, 0, removed);
			return updated;
		});
	};

	const getVideoPath = (): string => {
		const contentFileName = `${contentFolder}/${video.type.toLowerCase()}s/${video.fileName}.mp4`;
		return `http://localhost:2222/api/content?input=${encodeURIComponent(contentFileName)}&type=${video.type.toLowerCase()}`;
	};

	return (
		<DndProvider backend={HTML5Backend}>
			<div className="flex" ref={containerRef} style={{width: "100%", height: "100%"}}>
				<div className="flex-1 p-4">
					<div className="aspect-w-16 aspect-h-9 bg-black rounded">
						<video
							autoPlay
							className="w-full h-full rounded"
							style={{maxHeight: "71.3vh"}}
							src={getVideoPath()}
							ref={videoRef}
							onClick={togglePlayPause}
						/>
					</div>
					<div
						className="timeline-wrapper mt-2"
						style={{
							position: "relative",
							overflowX: "scroll",
							overflowY: "hidden",
							width: "100%",
							userSelect: "none"
						}}
						ref={scrollContainerRef}
						onMouseMove={(e) => {
							handleSelectionDrag(e);
							handleSelectionResize(e);
							handleMarkerDrag(e);
						}}
					>
						<div
							className="ticks-container"
							style={{
								position: "relative",
								height: "40px",
								width: `${duration * pixelsPerSecond}px`,
								minWidth: "100%",
								overflow: "hidden"
							}}
						>
							{minorTicks.map((tickTime, index) => {
								if (tickTime >= duration) return null;
								const leftPos = tickTime * pixelsPerSecond;
								return (
									<div
										key={`minor-${index}`}
										style={{
											position: "absolute",
											left: `${leftPos}px`,
											bottom: "0",
											height: "6px",
											borderLeft: "1px solid rgba(255, 255, 255, 0.2)"
										}}
									/>
								);
							})}
							{majorTicks.map((tickTime, index) => {
								if (tickTime > duration) return null;
								const leftPos = tickTime * pixelsPerSecond;
								return (
									<div
										key={`major-${index}`}
										style={{
											position: "absolute",
											bottom: 0,
											left: `${leftPos}px`,
											textAlign: "center",
											color: "#fff",
											userSelect: "none",
											transform: "translateX(-50%)",
											whiteSpace: "nowrap"
										}}
									>
										<span
											style={{
												position: "absolute",
												bottom: "100%",
												left: "50%",
												transform: "translateX(-50%)",
												fontSize: "12px",
												marginBottom: "3px"
											}}
										>
											{formatTime(tickTime)}
										</span>
										<div
											style={{
												width: "2px",
												height: "10px",
												backgroundColor: "#fff",
												margin: "0 auto"
											}}
										/>
									</div>
								);
							})}
						</div>
						<div
							className="timeline-container"
							style={{
								position: "relative",
								height: "50px",
								width: `${duration * pixelsPerSecond}px`,
								minWidth: "100%",
								backgroundColor: "#2a2a2a",
								borderRadius: "10px",
								overflow: "hidden",
								cursor: "pointer"
							}}
							onClick={handleTimelineClick}
						>
							{sortedSelections.map((sel) => {
								const left = sel.startTime * pixelsPerSecond;
								const width = (sel.endTime - sel.startTime) * pixelsPerSecond;
								const isHovered = sel.id === hoveredSelectionId;
								return (
									<div
										key={sel.id}
										className={`absolute top-0 left-0 h-full cursor-move border overflow-hidden ${isHovered && !isHoveredByTimeline ? "border-primary bg-primary" : "border-secondary bg-secondary" }`}
										style={{
											left: `${left}px`,
											width: `${width}px`,
										}}
										onMouseEnter={() => {
											setHoveredSelectionId(sel.id);
											setIsHoveredByTimeline(true);
										}}
										onMouseLeave={() => {
											setHoveredSelectionId(null);
											setIsHoveredByTimeline(false);
										}}
										onMouseDown={(e) => handleSelectionDragStart(e, sel.id)}
										onContextMenu={(e) => handleSelectionContextMenu(e, sel.id)}
									>
										<div
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												right: 0,
												textAlign: "center",
												color: "#fff",
												fontSize: "12px",
												userSelect: "none",
												paddingTop: "2px",
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis"
											}}
										>
											{formatTime(sel.startTime)} - {formatTime(sel.endTime)}
										</div>
										<div
											style={{
												position: "absolute",
												top: 0,
												left: "-7px",
												width: "17px",
												height: "100%",
												backgroundColor: "transparent",
												cursor: "col-resize"
											}}
											onMouseDown={(e) => handleResizeStart(e, sel.id, "start")}
										/>
										<div
											style={{
												position: "absolute",
												top: 0,
												right: "-7px",
												width: "17px",
												height: "100%",
												backgroundColor: "transparent",
												cursor: "col-resize"
											}}
											onMouseDown={(e) => handleResizeStart(e, sel.id, "end")}
										/>
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
									cursor: "pointer",
									borderRadius: "8px"
								}}
								onMouseDown={handleMarkerDragStart}
							/>
						</div>
					</div>
					{video.type === "Video" && (
						<div className="mt-2">
							<button
								className="btn btn-primary mr-2"
								disabled={state.isCreatingClip}
								onClick={handleCreateClip}
							>
								Create Clip
								{state.isCreatingClip && (
									<span className="loading loading-spinner loading-xs" />
								)}
							</button>
							<button className="btn btn-secondary" onClick={handleAddSelection}>
								Add Selection
							</button>
						</div>
					)}
				</div>
				{video.type === "Video" && (
					<div className="bg-base-300 w-52 overflow-y-scroll pl-4 pr-1">
						<h2 className="text-lg font-bold mb-2 mt-3">Selections</h2>
						{selections.map((sel, index) => (
							<SelectionCard
								key={sel.id}
								selection={sel}
								index={index}
								moveCard={moveCard}
								formatTime={formatTime}
								isHovered={hoveredSelectionId === sel.id}
								setHoveredSelectionId={setHoveredSelectionId}
							/>
						))}
					</div>
				)}
			</div>
		</DndProvider>
	);
}
