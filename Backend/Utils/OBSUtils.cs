using LibObs;
using NAudio.Wave;
using ReCaps.Backend.Services;
using ReCaps.Models;
using Serilog;
using System.IO.Compression;
using static LibObs.Obs;

namespace ReCaps.Backend.Utils
{
    public static class OBSUtils
    {
        public static bool IsInitialized { get; private set; }
        static bool signalOutputStop = false;
        static IntPtr output = IntPtr.Zero;
        static IntPtr displaySource = IntPtr.Zero;
        static IntPtr videoEncoder = IntPtr.Zero;
        static IntPtr audioEncoder = IntPtr.Zero;

        static signal_callback_t outputStopCallback = (data, cd) =>
        {
            signalOutputStop = true;
        };

        public static async Task InitializeAsync()
        {
            if (IsInitialized) return;

            await CheckIfExistsOrDownloadAsync();

            if (obs_initialized())
                throw new Exception("Error: OBS is already initialized.");

            base_set_log_handler(new log_handler_t((level, msg, args, p) =>
            {
                try
                {
                    string formattedMessage = MarshalUtils.GetLogMessage(msg, args);
                    Log.Information($"{((LogErrorLevel)level)}: {formattedMessage}");
                }
                catch (Exception e)
                {
                    Log.Error(e.ToString());
                    Log.Error(e.StackTrace);
                }
            }), IntPtr.Zero);

            Log.Information("libobs version: " + obs_get_version_string());

            if (!obs_startup("en-US", null, IntPtr.Zero))
                throw new Exception("Error during OBS startup.");

            obs_add_data_path("./data/libobs/");
            obs_add_module_path("./obs-plugins/64bit/", "./data/obs-plugins/%module%/");

            obs_load_all_modules();
            obs_log_loaded_modules();
            obs_post_load_modules();

            IsInitialized = true;
            Settings.Instance.State.HasLoadedObs = true;
            Log.Information("OBS initialized successfully!");
            Task.Run(() =>
            {
                GameDetectionService.Start();
            });
        }

        public static bool StartRecording(string name = "Unknown")
        {
            if (output != IntPtr.Zero)
            {
                Log.Information("Recording is already in progress.");
                return false;
            }

            signalOutputStop = false;

            // Reset audio
            obs_audio_info audioInfo = new obs_audio_info()
            {
                samples_per_sec = 44100,
                speakers = speaker_layout.SPEAKERS_STEREO
            };
            if (!obs_reset_audio(ref audioInfo))
                throw new Exception("Failed to reset audio settings.");

            uint baseWidth, baseHeight;
            SettingsUtils.GetPrimaryMonitorResolution(out baseWidth, out baseHeight);

            uint outputWidth, outputHeight;
            SettingsUtils.GetResolution(Settings.Instance.Resolution, out outputWidth, out outputHeight);

            // Reset video
            obs_video_info videoInfo = new obs_video_info()
            {
                adapter = 0,
                graphics_module = "libobs-d3d11",
                fps_num = (uint)Settings.Instance.FrameRate,
                fps_den = 1,
                base_width = baseWidth,
                base_height = baseHeight,
                output_width = outputWidth,
                output_height = outputHeight,
                output_format = video_format.VIDEO_FORMAT_NV12,
                gpu_conversion = true,
                colorspace = video_colorspace.VIDEO_CS_DEFAULT,
                range = video_range_type.VIDEO_RANGE_DEFAULT,
                scale_type = obs_scale_type.OBS_SCALE_BILINEAR
            };
            if (obs_reset_video(ref videoInfo) != 0)
                throw new Exception("Failed to reset video settings.");

            // Create display capture source
            IntPtr displayCaptureSettings = obs_data_create();
            obs_data_set_int(displayCaptureSettings, "monitor", 0); // Primary monitor
            displaySource = obs_source_create("monitor_capture", "Display Capture", displayCaptureSettings, IntPtr.Zero);
            obs_data_release(displayCaptureSettings);

            obs_set_output_source(0, displaySource);

            // Create video encoder
            IntPtr videoEncoderSettings = obs_data_create();
            obs_data_set_string(videoEncoderSettings, "preset", "veryfast");
            obs_data_set_string(videoEncoderSettings, "profile", "high");
            obs_data_set_string(videoEncoderSettings, "rate_control", Settings.Instance.RateControl);

            switch (Settings.Instance.RateControl)
            {
                case "CBR":
                    int videoBitrateKbps = Settings.Instance.Bitrate * 1000;
                    obs_data_set_int(videoEncoderSettings, "bitrate", (uint)videoBitrateKbps);
                    break;

                case "VBR":
                    videoBitrateKbps = Settings.Instance.Bitrate * 1000;
                    obs_data_set_int(videoEncoderSettings, "bitrate", (uint)videoBitrateKbps);
                    break;

                case "CRF":
                    obs_data_set_int(videoEncoderSettings, "crf", (uint)Settings.Instance.CrfValue);
                    break;

                case "CQP":
                    obs_data_set_int(videoEncoderSettings, "qp", (uint)Settings.Instance.CqLevel);
                    break;

                default:
                    throw new Exception("Unsupported Rate Control method.");
            }

            videoEncoder = obs_video_encoder_create("obs_x264", "simple_x264_encoder", videoEncoderSettings, IntPtr.Zero);
            obs_data_release(videoEncoderSettings);
            obs_encoder_set_video(videoEncoder, obs_get_video());

            // Create audio encoder
            IntPtr audioEncoderSettings = obs_data_create();
            obs_data_set_int(audioEncoderSettings, "bitrate", 160);
            audioEncoder = obs_audio_encoder_create("ffmpeg_aac", "simple_aac_encoder", audioEncoderSettings, 0, IntPtr.Zero);
            obs_data_release(audioEncoderSettings);
            obs_encoder_set_audio(audioEncoder, obs_get_audio());

            // Create output
            IntPtr outputSettings = obs_data_create();
            string videoPath = Settings.Instance.ContentFolder + "/videos";
            if (!Directory.Exists(videoPath))
            {
                Directory.CreateDirectory(videoPath);
            }

            string videoOutputPath = $"{Settings.Instance.ContentFolder}/videos/{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.mp4";
            string filePath = $"{Settings.Instance.ContentFolder}/{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.mp4";
            obs_data_set_string(outputSettings, "path", videoOutputPath);
            obs_data_set_string(outputSettings, "format_name", "mp4");
            output = obs_output_create("ffmpeg_muxer", "simple_output", outputSettings, IntPtr.Zero);
            obs_data_release(outputSettings);

            obs_output_set_video_encoder(output, videoEncoder);
            obs_output_set_audio_encoder(output, audioEncoder, 0);

            // Connect stop signal handler
            signal_handler_connect(obs_output_get_signal_handler(output), "stop", outputStopCallback, IntPtr.Zero);

            if (!obs_output_start(output))
            {
                Log.Error("Failed to start recording.");
                return false;
            }

            // Initialize the Recording object
            Settings.Instance.State.Recording = new Recording()
            {
                StartTime = DateTime.Now,
                FilePath = videoOutputPath,
                Game = name
            };

            MessageUtils.SendSettingsToFrontend();

            Log.Information("Recording started: " + filePath);
            PlayStartSound();
            return true;
        }

        public static void StopRecording()
        {
            if (output != IntPtr.Zero)
            {
                // Update the Recording object with the end time
                if (Settings.Instance.State.Recording != null)
                {
                    Settings.Instance.State.UpdateRecordingEndTime(DateTime.Now);
                }
                obs_output_stop(output);

                int attempts = 0;
                while (!signalOutputStop && attempts < 50)
                {
                    Thread.Sleep(100);
                    attempts++;
                }

                if (!signalOutputStop)
                    obs_output_force_stop(output);

                DisposeOutput();
                DisposeSources();
                DisposeEncoders();

                output = IntPtr.Zero;
                Log.Information("Recording stopped.");

                ContentUtils.CreateMetadataFile(Settings.Instance.State.Recording.FilePath, Content.ContentType.Video, Settings.Instance.State.Recording.Game);
                ContentUtils.CreateThumbnail(Settings.Instance.State.Recording.FilePath, Content.ContentType.Video);
                // Optionally, log the recording metadata
                if (Settings.Instance.State.Recording != null)
                {
                    Log.Information($"Recording details:");
                    Log.Information($"Start Time: {Settings.Instance.State.Recording.StartTime}");
                    Log.Information($"End Time: {Settings.Instance.State.Recording.EndTime}");
                    Log.Information($"Duration: {Settings.Instance.State.Recording.Duration}");
                    Log.Information($"File Path: {Settings.Instance.State.Recording.FilePath}");
                }
                SettingsUtils.LoadContentFromFolderIntoState(false);
                Settings.Instance.State.Recording = null;
            }
        }

        public static void DisposeSources()
        {
            if (displaySource != IntPtr.Zero)
            {
                obs_source_release(displaySource);
                displaySource = IntPtr.Zero;
            }
        }

        public static void DisposeEncoders()
        {
            if (videoEncoder != IntPtr.Zero)
            {
                obs_encoder_release(videoEncoder);
                videoEncoder = IntPtr.Zero;
            }
            if (audioEncoder != IntPtr.Zero)
            {
                obs_encoder_release(audioEncoder);
                audioEncoder = IntPtr.Zero;
            }
        }

        public static void DisposeOutput()
        {
            if (output != IntPtr.Zero)
            {
                signal_handler_disconnect(obs_output_get_signal_handler(output), "stop", outputStopCallback, IntPtr.Zero);
                obs_output_release(output);
                output = IntPtr.Zero;
            }
        }

        private static async Task CheckIfExistsOrDownloadAsync()
        {
            Log.Information("Checking if OBS is installed");

            string currentDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string dllPath = Path.Combine(currentDirectory, "obs.dll");
            if (File.Exists(dllPath))
            {
                Log.Information("OBS is installed");
                return;
            }

            string zipPath = Path.Combine(currentDirectory, "obs.zip");
            string apiUrl = "https://api.github.com/repos/Segergren/ReCaps/contents/obs.zip?ref=main";

            using (var httpClient = new HttpClient())
            {
                httpClient.DefaultRequestHeaders.Add("User-Agent", "ReCaps");
                httpClient.DefaultRequestHeaders.Add("Accept", "application/vnd.github.v3.json");
                httpClient.DefaultRequestHeaders.Add("Authorization", "token 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");

                Log.Information("Fetching download URL...");
                var response = await httpClient.GetAsync(apiUrl);
                if (!response.IsSuccessStatusCode)
                {
                    Log.Error($"Failed to fetch metadata from {apiUrl}. Status: {response.StatusCode}");
                    throw new Exception($"Failed to fetch file metadata: {response.ReasonPhrase}");
                }

                var jsonResponse = await response.Content.ReadAsStringAsync();
                var metadata = System.Text.Json.JsonSerializer.Deserialize<GitHubFileMetadata>(jsonResponse);
                if (metadata?.DownloadUrl == null)
                {
                    Log.Error("Download URL not found in the API response.");
                    throw new Exception("Invalid API response: Missing download URL.");
                }

                Log.Information("Downloading OBS...");
                httpClient.DefaultRequestHeaders.Clear();
                var zipBytes = await httpClient.GetByteArrayAsync(metadata.DownloadUrl);
                await File.WriteAllBytesAsync(zipPath, zipBytes);
                Log.Information("Download complete");
            }

            Log.Information("Extracting OBS...");
            ZipFile.ExtractToDirectory(zipPath, currentDirectory);
            File.Delete(zipPath);
            Log.Information("OBS setup complete");
        }

        private class GitHubFileMetadata
        {
            [System.Text.Json.Serialization.JsonPropertyName("download_url")]
            public string DownloadUrl { get; set; }
        }

        private static void PlayStartSound()
        {
            // Convert UnmanagedMemoryStream to byte[]
            using (var unmanagedStream = Properties.Resources.start)
            using (var memoryStream = new MemoryStream())
            {
                unmanagedStream.CopyTo(memoryStream); // Copy stream content
                byte[] audioData = memoryStream.ToArray(); // Convert to byte[]

                // Use NAudio's WaveStream to control volume
                using (var audioReader = new WaveFileReader(new MemoryStream(audioData)))
                using (var waveOut = new WaveOutEvent())
                {
                    // Create a volume stream
                    var volumeStream = new VolumeWaveProvider16(audioReader)
                    {
                        Volume = 0.5f // Adjust volume (0.0 to 1.0)
                    };

                    waveOut.Init(volumeStream);
                    waveOut.Play();

                    // Wait for playback to complete
                    while (waveOut.PlaybackState == PlaybackState.Playing)
                    {
                        System.Threading.Thread.Sleep(100); // Sleep briefly to allow playback to finish
                    }
                }
            }
        }

    }
}
