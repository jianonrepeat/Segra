using ReCaps.Backend.Utils;
using Serilog;
using System.Diagnostics;
using System.Runtime.InteropServices;
using EventHook;
using ReCaps.Models;
using System;

namespace ReCaps.Backend.Services
{
    public static class GameDetectionService
    {
        static EventHookFactory eventHookFactory;
        private static ApplicationWatcher applicationWatcher;
        private static Process currentGameProcess;

        [DllImport("user32.dll", SetLastError = true)]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        public static void Start()
        {
            Log.Information("Starting game detection service");
            eventHookFactory = new EventHookFactory();
            applicationWatcher = eventHookFactory.GetApplicationWatcher();
            applicationWatcher.Start();

            applicationWatcher.OnApplicationWindowChange += OnApplicationWindowChange;

            DetectRunningGames();
        }

        public static void Stop()
        {
            if (eventHookFactory != null)
            {
                applicationWatcher.Stop();
                eventHookFactory.Dispose();
            }
        }

        private static void OnApplicationWindowChange(object sender, ApplicationEventArgs e)
        {
            try
            {
                var appName = e.ApplicationData.AppName;
                var appTitle = e.ApplicationData.AppTitle;
                var appPath = e.ApplicationData.AppPath;
                Log.Information($"Window event: '{appName}' with title '{appTitle}' was {e.Event}");

                if (IsGameProcess(appPath))
                {
                    if (e.Event == ApplicationEvents.Launched && Settings.Instance.State.Recording == null)
                    {
                        // Start recording
                        OBSUtils.StartRecording(GameNameUtils.GetGameNameOrDefault(appName, appPath));

                        // Now we switch from window-based detection to process-based because
                        // DX11 programs seems to bypass ApplicationEvents.Closed events
                        // Get the process from the window handle
                        uint pid;
                        GetWindowThreadProcessId(e.ApplicationData.HWnd, out pid);
                        if (pid != 0)
                        {
                            var proc = Process.GetProcessById((int)pid);
                            if (proc != null && !proc.HasExited)
                            {
                                currentGameProcess = proc;
                                currentGameProcess.EnableRaisingEvents = true;
                                currentGameProcess.Exited += CurrentGameProcess_Exited;

                                // Stop application watcher to avoid double handling
                                applicationWatcher.Stop();
                                Log.Information("Switched to process-based detection. Stopped the window event watcher.");
                            }
                        }
                    }
                }
                else
                {
                    Log.Information($"Non-game window of '{appName}' was {e.Event}");
                }
            }
            catch (Exception ex)
            {
                Log.Error("Game detection error: " + ex.Message);
            }
        }

        private static void CurrentGameProcess_Exited(object sender, EventArgs e)
        {
            try
            {
                Log.Information("Game process exited. Stopping recording.");
                if (Settings.Instance.State.Recording != null)
                {
                    OBSUtils.StopRecording();
                }
            }
            catch (Exception ex)
            {
                Log.Error("Error stopping recording on process exit: " + ex.Message);
            }
            finally
            {
                // Once the process is gone, restart the event watcher
                Log.Information("Restarting the application watcher.");
                applicationWatcher.Start();
                currentGameProcess = null;
            }
        }

        private static void DetectRunningGames()
        {
            var processes = Process.GetProcesses();
            foreach (var proc in processes)
            {
                try
                {
                    if (IsGameProcess(proc.MainModule.FileName) && Settings.Instance.State.Recording == null)
                    {
                        try
                        {
                            string filePath = proc.MainModule.FileName;
                            OBSUtils.StartRecording(GameNameUtils.GetGameNameOrDefault(proc.ProcessName, filePath));
                        }
                        catch (Exception ex)
                        {
                            OBSUtils.StartRecording(proc.ProcessName);
                        }

                        if (!proc.HasExited)
                        {
                            currentGameProcess = proc;
                            currentGameProcess.EnableRaisingEvents = true;
                            currentGameProcess.Exited += CurrentGameProcess_Exited;

                            // Stop watcher since we already detected the game
                            applicationWatcher.Stop();
                            Log.Information("Found a running game process. Stopped window event watcher.");
                        }
                        break;
                    }
                }
                catch (Exception)
                {
                    // No-op
                }
            }
        }

        private static bool IsGameProcess(string filePath)
        {
            // TODO (os) implement Epic Games and ban anti-cheat windows

            return filePath.Replace("\\", "/").Contains(GameNameUtils.SteamAppsCommonPath);
        }
    }
}