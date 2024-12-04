using Photino.NET;
using Photino.NET.Server;
using ReCaps.Backend.Utils;
using ReCaps.Models;
using Serilog;
using System.Drawing;
using Velopack;

namespace Photino.ReCaps
{
    class Program
    {
#if DEBUG
        public static bool IsDebugMode = true;      //serve files from dev server
#else
        public static bool IsDebugMode = false;     //serve files from asp.net runtime
#endif

        public static PhotinoWindow window { get; private set; }

        [STAThread]
        static void Main(string[] args)
        {
            // Configure Serilog
            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Debug()
                .WriteTo.Console()
                .WriteTo.Debug()
                .WriteTo.File("logs/application.log", rollingInterval: RollingInterval.Day)
                .CreateLogger();

            VelopackApp.Build().Run();

            try
            {
                Log.Information("Application starting up...");

                // Set up the PhotinoServer
                PhotinoServer
                    .CreateStaticFileServer(args, out string baseUrl)
                    .RunAsync();

                string appUrl = IsDebugMode ? "http://localhost:2882" : $"{baseUrl}/index.html";
                Log.Information("Serving React app at {AppUrl}", appUrl);

                // Window title declared here for visibility
                string windowTitle = "ReCaps";

                SettingsUtils.LoadSettings();
                Settings.Instance.State.Initialize();
                SettingsUtils.SaveSettings();

                // Start WebSocket and Load Settings
                Task.Run(MessageUtils.StartWebsocket);
                SettingsUtils.LoadContentFromFolderIntoState();

                // Initialize the PhotinoWindow
                window = new PhotinoWindow()
                    .SetIconFile("C:/Users/admin/Downloads/icon.ico")
                    .SetTitle(windowTitle)
                    .SetUseOsDefaultSize(false)
                    .SetSize(new Size(2048, 1024))
                    .SetSize(new Size(1280, 720))
                    .Center()
                    .SetResizable(true)
                    .RegisterWebMessageReceivedHandler((object sender, string message) =>
                    {
                        window = (PhotinoWindow)sender;
                        MessageUtils.HandleMessage(message);
                    })
                    .Load(appUrl);

                // Initialize OBSUtils
                Task.Run(() =>
                {
                    try
                    {
                        OBSUtils.Initialize();
                        Log.Information("OBSUtils initialized successfully.");
                    }
                    catch (Exception ex)
                    {
                        Log.Error(ex, "Failed to initialize OBSUtils.");
                    }
                });

                window.WaitForClose(); // Starts the application event loop
            }
            catch (Exception ex)
            {
                Log.Fatal(ex, "Application terminated unexpectedly.");
            }
            finally
            {
                Log.Information("Application shutting down.");
                Log.CloseAndFlush(); // Ensure all logs are written before the application exits
            }
        }
    }
}
