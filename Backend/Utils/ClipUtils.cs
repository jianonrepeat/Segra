using System.Diagnostics;
using Serilog;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Segra.Backend.Models;
using static Segra.Backend.Utils.GeneralUtils;

namespace Segra.Backend.Utils
{
    public static class ClipUtils
    {
        // Dictionary to store active FFmpeg processes
        private static readonly Dictionary<int, List<Process>> ActiveFFmpegProcesses = new Dictionary<int, List<Process>>();
        // Lock for thread safety
        private static readonly object ProcessLock = new object();

        public static async Task CreateAiClipFromBookmarks(List<Bookmark> bookmarks, AiProgressMessage aiProgressMessage)
        {
            // Convert bookmarks to initial selections with buffer times
            List<Selection> initialSelections = new List<Selection>();

            foreach (var bookmark in bookmarks)
            {
                // Calculate start and end times (5 seconds before and after the bookmark time)
                // TODO (os): add so the AI calculates the added time before and after
                double startTime = Math.Max(0, bookmark.Time.TotalSeconds - 5); // Ensure not negative
                double endTime = bookmark.Time.TotalSeconds + 5;

                initialSelections.Add(new Selection
                {
                    Type = aiProgressMessage.Content.Type.ToString(),
                    StartTime = startTime,
                    EndTime = endTime,
                    FileName = aiProgressMessage.Content.FileName,
                    Game = aiProgressMessage.Content.Game
                });
            }

            // Merge overlapping selections
            List<Selection> mergedSelections = MergeOverlappingSelections(initialSelections);

            Log.Information($"Merged {initialSelections.Count} bookmarks into {mergedSelections.Count} clip sections");

            await CreateClips(mergedSelections, false, aiProgressMessage);
        }

        public static async Task CreateClips(List<Selection> selections, bool updateFrontend = true, AiProgressMessage? aiProgressMessage = null)
        {
            int id = Guid.NewGuid().GetHashCode();
            if (updateFrontend)
            {
                await MessageUtils.SendFrontendMessage("ClipProgress", new { id, progress = 0, selections });
            }
            string videoFolder = Settings.Instance.ContentFolder;

            if (selections == null || !selections.Any())
            {
                Log.Error("No selections provided.");
                return;
            }

            double totalDuration = selections.Sum(s => s.EndTime - s.StartTime);
            if (totalDuration <= 0)
            {
                Log.Error("Total clip duration is zero or negative.");
                return;
            }

            string outputFolder = Path.Combine(videoFolder, aiProgressMessage != null ? "highlights" : "clips");
            Directory.CreateDirectory(outputFolder);

            List<string> tempClipFiles = new List<string>();

            if (!FFmpegUtils.FFmpegExists())
            {
                Log.Error($"FFmpeg executable not found at path: {FFmpegUtils.GetFFmpegPath()}");
                return;
            }

            double processedDuration = 0;
            foreach (var selection in selections)
            {
                string inputFilePath = Path.Combine(videoFolder, selection.Type.ToLower() + "s", $"{selection.FileName}.mp4").Replace("\\", "/");
                if (!File.Exists(inputFilePath))
                {
                    Log.Information($"Input video file not found: {inputFilePath}");
                    continue;
                }

                string tempFileName = Path.Combine(Path.GetTempPath(), $"clip{Guid.NewGuid()}.mp4");
                double clipDuration = selection.EndTime - selection.StartTime;

                await ExtractClip(id, inputFilePath, tempFileName, selection.StartTime, selection.EndTime, progress =>
                {
                    double currentProgress = (processedDuration + (progress * clipDuration)) / totalDuration * 100;
                    if (updateFrontend)
                    {
                        _ = MessageUtils.SendFrontendMessage("ClipProgress", new { id, progress = currentProgress, selections });
                    }

                    if (aiProgressMessage != null && !string.IsNullOrEmpty(aiProgressMessage.Id))
                    {
                        // Update from 80% to 98%
                        double fraction = (processedDuration + (progress * clipDuration)) / totalDuration;
                        double aiProgress = 80 + fraction * 18;
                        if (aiProgress > 98) aiProgress = 98;

                        aiProgressMessage.Progress = (int)Math.Floor(aiProgress);
                        aiProgressMessage.Message = $"Rendering clips...";
                        _ = MessageUtils.SendFrontendMessage("AiProgress", aiProgressMessage);
                    }
                });

                processedDuration += clipDuration;
                tempClipFiles.Add(tempFileName);
                if (updateFrontend)
                {
                    await MessageUtils.SendFrontendMessage("ClipProgress", new { id, progress = (processedDuration / totalDuration) * 100, selections });
                }
            }

            if (!tempClipFiles.Any())
            {
                Log.Information("No valid clips were extracted.");
                return;
            }

            // Concatenation phase (progress completes to 100% when done)
            string concatFilePath = Path.Combine(Path.GetTempPath(), $"concat_list_{Guid.NewGuid()}.txt");
            await File.WriteAllLinesAsync(concatFilePath, tempClipFiles.Select(f => $"file '{f.Replace("\\", "\\\\").Replace("'", "\\'")}"));

            string outputFileName = $"{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.mp4";
            string outputFilePath = Path.Combine(outputFolder, outputFileName).Replace("\\", "/");

            if (aiProgressMessage != null)
            {
                aiProgressMessage.Progress = 99;
                aiProgressMessage.Message = "Rendering final clip...";
                _ = MessageUtils.SendFrontendMessage("AiProgress", aiProgressMessage);
            }

            await FFmpegUtils.RunWithProgress(id,
                $"-y -f concat -safe 0 -i \"{concatFilePath}\" -c copy -movflags +faststart \"{outputFilePath}\"",
                totalDuration,
                progress =>
                {
                    if (updateFrontend)
                    {
                        _ = MessageUtils.SendFrontendMessage("ClipProgress", new { id, progress = 100, selections });
                    }
                }
            );

            // Cleanup
            tempClipFiles.ForEach(f => SafeDelete(f));
            SafeDelete(concatFilePath);

            // Finalization
            ContentUtils.CreateMetadataFile(outputFilePath, aiProgressMessage != null ? Content.ContentType.Highlight : Content.ContentType.Clip, selections.FirstOrDefault()?.Game!, null, selections.FirstOrDefault()?.Title);
            await ContentUtils.CreateThumbnail(outputFilePath, aiProgressMessage != null ? Content.ContentType.Highlight : Content.ContentType.Clip);
            ContentUtils.CreateWaveformFile(outputFilePath, aiProgressMessage != null ? Content.ContentType.Highlight : Content.ContentType.Clip);
            await SettingsUtils.LoadContentFromFolderIntoState();
            if (updateFrontend)
            {
                await MessageUtils.SendFrontendMessage("ClipProgress", new { id, progress = 100, selections });
            }
        }

        public static async Task<string?> CreateAiClipToAnalyzeFromBookmark(Bookmark bookmark, Content content)
        {
            // Calculate start and end times (10 seconds before and 10 seconds after the bookmark time) for the Ai to analyze
            Log.Information("Creating AI clip to analyze for " + bookmark);
            double startTime = Math.Max(0, bookmark.Time.TotalSeconds - 10); // Ensure not negative
            double endTime = bookmark.Time.TotalSeconds + 10; // TODO (os): what happens if this is longer than the clip if it's right at the end?

            string videoFolder = Settings.Instance.ContentFolder;

            // Create .ai directory if it doesn't exist
            string aiOutputFolder = Path.Combine(videoFolder, ".ai").Replace("\\", "/");
            DirectoryInfo dir = Directory.CreateDirectory(aiOutputFolder);
            dir.Attributes |= FileAttributes.Hidden;

            string inputFilePath = Path.Combine(videoFolder, content.Type.ToString().ToLower() + "s", $"{content.FileName}.mp4").Replace("\\", "/");
            if (!File.Exists(inputFilePath))
            {
                Log.Error($"Input video file not found: {inputFilePath}");
                return null;
            }

            string outputFileName = $"{content.FileName}_{bookmark.Type}_{bookmark.Id}.mp4";
            string outputFilePath = Path.Combine(aiOutputFolder, outputFileName).Replace("\\", "/");

            if (!FFmpegUtils.FFmpegExists())
            {
                Log.Error($"FFmpeg executable not found at path: {FFmpegUtils.GetFFmpegPath()}");
                return null;
            }

            double clipDuration = endTime - startTime;

            // 1) Extract WITHOUT re-encoding to a temp file (fastest way)
            string tempFilePath = Path.GetTempFileName().Replace(".tmp", ".mp4");
            string copyArguments =
                $"-y -ss {startTime.ToString(CultureInfo.InvariantCulture)} " +
                $"-t {clipDuration.ToString(CultureInfo.InvariantCulture)} " +
                $"-i \"{inputFilePath}\" " +
                $"-c copy -movflags +faststart \"{tempFilePath}\"";

            await FFmpegUtils.RunSimple(copyArguments);

            var fileInfo = new FileInfo(tempFilePath);
            const long oneGB = 1L << 30; // 1GB in bytes

            // The file limit is 1GB, so if it's larger, we need to compress it (this takes longer time)
            if (fileInfo.Length > oneGB)
            {
                Log.Information($"Temp file is larger than 1GB ({fileInfo.Length} bytes). Re-encoding...");

                var currentSettings = Settings.Instance;
                string videoCodecAi;
                string qualityArgsAi = "";
                string presetArgsAi = "";

                if (currentSettings.ClipEncoder.Equals("gpu", StringComparison.OrdinalIgnoreCase))
                {
                    GpuVendor gpuVendor = DetectGpuVendor();

                    switch (gpuVendor)
                    {
                        case GpuVendor.Nvidia:
                            if (currentSettings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                                videoCodecAi = "hevc_nvenc";
                            else if (currentSettings.ClipCodec.Equals("av1", StringComparison.OrdinalIgnoreCase))
                                videoCodecAi = "av1_nvenc";
                            else
                                videoCodecAi = "h264_nvenc";

                            qualityArgsAi = $"-cq {currentSettings.ClipQualityGpu}";
                            presetArgsAi = $"-preset {currentSettings.ClipPreset}";
                            break;

                        case GpuVendor.AMD:
                            if (currentSettings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                                videoCodecAi = "hevc_amf";
                            else if (currentSettings.ClipCodec.Equals("av1", StringComparison.OrdinalIgnoreCase))
                                videoCodecAi = "av1_amf";
                            else
                                videoCodecAi = "h264_amf";

qualityArgsAi = $"-qp_i {currentSettings.ClipQualityGpu} -qp_p {currentSettings.ClipQualityGpu}";
                            // Map common presets to AMF compatible values for AI clip as well
                            var amfPresetAi = currentSettings.ClipPreset.ToLower() switch
                            {
                                "ultrafast" or "superfast" or "veryfast" => "speed",
                                "faster" or "fast" => "balanced",
                                "medium" or "slow" or "slower" or "veryslow" => "quality",
                                _ => "balanced" // Default to balanced if unknown preset
                            };
                            presetArgsAi = $"-quality {amfPresetAi}";
                            break;

                        case GpuVendor.Intel:
                            if (currentSettings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                                videoCodecAi = "hevc_qsv";
                            else if (currentSettings.ClipCodec.Equals("av1", StringComparison.OrdinalIgnoreCase))
                                videoCodecAi = "av1_qsv";
                            else
                                videoCodecAi = "h264_qsv";

                            qualityArgsAi = $"-global_quality {currentSettings.ClipQualityGpu}";
                            presetArgsAi = $"-preset {currentSettings.ClipPreset}";
                            break;

                        default:
                            // Fall back to CPU encoding if GPU vendor is unknown
                            Log.Warning("Unknown GPU vendor detected for AI clip, falling back to CPU encoding");
                            if (currentSettings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                                videoCodecAi = "libx265";
                            else
                                videoCodecAi = "libx264";

                            qualityArgsAi = $"-crf {currentSettings.ClipQualityCpu}";
                            presetArgsAi = $"-preset {currentSettings.ClipPreset}";
                            break;
                    }
                }
                else
                {
                    if (currentSettings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                        videoCodecAi = "libx265";
                    else
                        videoCodecAi = "libx264";

                    qualityArgsAi = $"-crf {currentSettings.ClipQualityCpu}";
                    presetArgsAi = $"-preset {currentSettings.ClipPreset}";
                }

                string fpsArgAi = currentSettings.ClipFps > 0 ? $"-r {currentSettings.ClipFps}" : "";

                string reencodeArguments =
                    $"-y -i \"{tempFilePath}\" " +
                    $"-c:v {videoCodecAi} {presetArgsAi} {qualityArgsAi} {fpsArgAi} " +
                    $"-c:a aac -b:a {currentSettings.ClipAudioQuality} -movflags +faststart \"{outputFilePath}\"";

                await FFmpegUtils.RunSimple(reencodeArguments);

                // After re-encode is done, we no longer need the temp file and the compressed file is already at the final output path
                SafeDelete(tempFilePath);
            }
            else
            {
                // If the file is <= 1GB, just move it to the final output path
                SafeDelete(outputFilePath);
                File.Move(tempFilePath, outputFilePath);
            }

            // Return the generated filepath so it can be tracked
            return outputFilePath;
        }

        private static List<Selection> MergeOverlappingSelections(List<Selection> selections)
        {
            // Sort selections by start time
            var sortedSelections = selections.OrderBy(s => s.StartTime).ToList();
            List<Selection> mergedSelections = new List<Selection>();

            // Start with the first selection
            Selection current = sortedSelections[0];

            // Iterate through the sorted selections
            for (int i = 1; i < sortedSelections.Count; i++)
            {
                var next = sortedSelections[i];

                // Check if the current selection overlaps with the next one
                if (current.EndTime >= next.StartTime)
                {
                    // Merge by extending the end time if needed
                    current.EndTime = Math.Max(current.EndTime, next.EndTime);
                }
                else
                {
                    // No overlap, add current to result and move to next
                    mergedSelections.Add(current);
                    current = next;
                }
            }

            // Add the last merged selection
            mergedSelections.Add(current);

            return mergedSelections;
        }


        private static async Task ExtractClip(int clipId, string inputFilePath, string outputFilePath, double startTime, double endTime,
                            Action<double> progressCallback)
        {
            double duration = endTime - startTime;
            var settings = Settings.Instance;

            string videoCodec;
            string qualityArgs;
            string presetArgs;
            if (settings.ClipEncoder.Equals("gpu", StringComparison.OrdinalIgnoreCase))
            {
                // GPU encoder uses hardware-accelerated codecs based on GPU vendor
                GpuVendor gpuVendor = DetectGpuVendor();

                switch (gpuVendor)
                {
                    case GpuVendor.Nvidia:
                        if (settings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                            videoCodec = "hevc_nvenc";
                        else if (settings.ClipCodec.Equals("av1", StringComparison.OrdinalIgnoreCase))
                            videoCodec = "av1_nvenc";
                        else
                            videoCodec = "h264_nvenc";

                        // NVENC uses -cq for quality control and specific presets
                        qualityArgs = $"-cq {settings.ClipQualityGpu}";
                        presetArgs = $"-preset {settings.ClipPreset}";
                        break;

                    case GpuVendor.AMD:
                        if (settings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                            videoCodec = "hevc_amf";
                        else if (settings.ClipCodec.Equals("av1", StringComparison.OrdinalIgnoreCase))
                            videoCodec = "av1_amf";
                        else
                            videoCodec = "h264_amf";

                        // AMF uses -qp_i, -qp_p for quality control
                        qualityArgs = $"-qp_i {settings.ClipQualityGpu} -qp_p {settings.ClipQualityGpu}";
                        // Map common presets to AMF compatible values
                        var amfPreset = settings.ClipPreset.ToLower() switch
                        {
                            "ultrafast" or "superfast" or "veryfast" => "speed",
                            "faster" or "fast" => "balanced",
                            "medium" or "slow" or "slower" or "veryslow" => "quality",
                            _ => "balanced" // Default to balanced if unknown preset
                        };
                        presetArgs = $"-quality {amfPreset}";
                        break;

                    case GpuVendor.Intel:
                        if (settings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                            videoCodec = "hevc_qsv";
                        else if (settings.ClipCodec.Equals("av1", StringComparison.OrdinalIgnoreCase))
                            videoCodec = "av1_qsv";
                        else
                            videoCodec = "h264_qsv";

                        // QSV uses -global_quality for ICQ mode
                        qualityArgs = $"-global_quality {settings.ClipQualityGpu}";
                        presetArgs = $"-preset {settings.ClipPreset}";
                        break;

                    default:
                        // Fall back to CPU encoding if GPU vendor is unknown
                        Log.Warning("Unknown GPU vendor detected, falling back to CPU encoding");
                        if (settings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                            videoCodec = "libx265";
                        else
                            videoCodec = "libx264";

                        // CPU codecs use -crf and standard presets
                        qualityArgs = $"-crf {settings.ClipQualityCpu}";
                        presetArgs = $"-preset {settings.ClipPreset}";
                        break;
                }
            }
            else
            {
                // CPU encoder uses software codecs
                if (settings.ClipCodec.Equals("h265", StringComparison.OrdinalIgnoreCase))
                    videoCodec = "libx265";
                else
                    videoCodec = "libx264";

                // CPU codecs use -crf and standard presets
                qualityArgs = $"-crf {settings.ClipQualityCpu}";
                presetArgs = $"-preset {settings.ClipPreset}";
            }

            string fpsArg = settings.ClipFps > 0 ? $"-r {settings.ClipFps}" : "";

            string arguments = $"-y -ss {startTime.ToString(CultureInfo.InvariantCulture)} -t {duration.ToString(CultureInfo.InvariantCulture)} " +
                             $"-i \"{inputFilePath}\" -c:v {videoCodec} {presetArgs} {qualityArgs} {fpsArg} " +
                             $"-c:a aac -b:a {settings.ClipAudioQuality} -movflags +faststart \"{outputFilePath}\"";
            Log.Information("Extracting clip");
            Log.Information($"FFmpeg arguments: {arguments}");
            await FFmpegUtils.RunWithProgress(clipId, arguments, duration, progressCallback);
        }


        public static void CancelClip(int clipId)
        {
            lock (ProcessLock)
            {
                if (ActiveFFmpegProcesses.TryGetValue(clipId, out var processes))
                {
                    foreach (var process in processes.ToList())
                    {
                        try
                        {
                            if (!process.HasExited)
                            {
                                process.Kill(true); // Force kill the process
                            }
                        }
                        catch (Exception ex)
                        {
                            Log.Error($"Error killing FFmpeg process: {ex.Message}");
                        }
                    }
                    ActiveFFmpegProcesses.Remove(clipId);
                }
            }
        }

        private static void SafeDelete(string path)
        {
            try { File.Delete(path); }
            catch (Exception ex) { Log.Information($"Error deleting file {path}: {ex.Message}"); }
        }
    }
}
