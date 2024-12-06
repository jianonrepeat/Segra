using Serilog;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.Web;

namespace ReCaps.Backend.ContentServer
{
    internal class ContentServer
    {
        private static HttpListener _httpListener;

        public static void StartServer(string prefix)
        {
            _httpListener = new HttpListener();
            _httpListener.Prefixes.Add(prefix);
            _httpListener.Start();
            Console.WriteLine($"Server started at {prefix}");

            _httpListener.BeginGetContext(OnRequest, null);
        }

        private static void OnRequest(IAsyncResult result)
        {
            try
            {
                var context = _httpListener.EndGetContext(result);
                var request = context.Request;
                var response = context.Response;

                if (request.RawUrl.StartsWith("/api/thumbnail"))
                {
                    HandleThumbnailRequest(context);
                }
                else if (request.RawUrl.StartsWith("/api/content"))
                {
                    HandleContentRequest(context);
                }
                else
                {
                    response.StatusCode = (int)HttpStatusCode.NotFound;
                    using (var writer = new StreamWriter(response.OutputStream))
                    {
                        writer.Write("Invalid endpoint.");
                    }
                    response.Close();
                }

                _httpListener.BeginGetContext(OnRequest, null);
            }
            catch (HttpListenerException ex)
            {
                // Log and suppress disconnection errors
                if (ex.ErrorCode != 995) // 995: The I/O operation has been aborted (client disconnect)
                {
                    Log.Error(ex, "HttpListenerException occurred.");
                }
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Unexpected error in OnRequest.");
            }
        }


        private static void HandleThumbnailRequest(HttpListenerContext context)
        {
            var query = HttpUtility.ParseQueryString(context.Request.Url.Query);
            string input = query["input"];

            var response = context.Response;

            try
            {
                if (File.Exists(input))
                {
                    byte[] buffer = File.ReadAllBytes(input);
                    response.ContentType = "image/jpeg"; // Change to appropriate MIME type if needed
                    response.AddHeader("Cache-Control", "public, max-age=86400");
                    response.AddHeader("Expires", DateTime.UtcNow.AddDays(1).ToString("R"));

                    var lastModified = File.GetLastWriteTimeUtc(input);
                    response.AddHeader("Last-Modified", lastModified.ToString("R"));

                    response.ContentLength64 = buffer.Length;
                    response.OutputStream.Write(buffer, 0, buffer.Length);
                }
                else
                {
                    response.StatusCode = (int)HttpStatusCode.NotFound;
                    using (var writer = new StreamWriter(response.OutputStream))
                    {
                        writer.Write("Thumbnail not found.");
                    }
                }
            }
            catch (HttpListenerException ex)
            {
                // Client disconnection. Do nothing.
            }
            catch (Exception ex)
            {
                // Log unexpected exceptions
                Log.Error(ex, "Unexpected error while processing thumbnail request.");
                response.StatusCode = (int)HttpStatusCode.InternalServerError;
                using (var writer = new StreamWriter(response.OutputStream))
                {
                    writer.Write("An error occurred.");
                }
            }
            finally
            {
                try
                {
                    response.Close();
                }
                catch (Exception ex)
                {
                    Log.Warning(ex, "Error closing response in HandleThumbnailRequest.");
                }
            }
        }


        private static void HandleContentRequest(HttpListenerContext context)
        {
            try
            {
                var query = HttpUtility.ParseQueryString(context.Request.Url.Query);
                string fileName = query["input"];
                string type = query["type"];

                var response = context.Response;

                if (File.Exists(fileName))
                {
                    FileInfo fileInfo = new FileInfo(fileName);
                    long fileLength = fileInfo.Length;
                    string rangeHeader = context.Request.Headers["Range"];
                    long start = 0, end = fileLength - 1;

                    if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes="))
                    {
                        // Parse Range header
                        string[] range = rangeHeader.Substring("bytes=".Length).Split('-');
                        if (!string.IsNullOrEmpty(range[0]))
                            start = long.Parse(range[0]);
                        if (!string.IsNullOrEmpty(range[1]))
                            end = long.Parse(range[1]);
                    }

                    if (start > end || end >= fileLength)
                    {
                        response.StatusCode = (int)HttpStatusCode.RequestedRangeNotSatisfiable;
                        response.Close();
                        return;
                    }

                    response.StatusCode = (int)HttpStatusCode.PartialContent;
                    response.Headers.Add("Accept-Ranges", "bytes");
                    response.Headers.Add("Content-Range", $"bytes {start}-{end}/{fileLength}");
                    response.ContentType = "video/mp4";

                    long contentLength = end - start + 1;
                    response.ContentLength64 = contentLength;

                    using (FileStream fs = new FileStream(fileName, FileMode.Open, FileAccess.Read))
                    {
                        fs.Seek(start, SeekOrigin.Begin);
                        byte[] buffer = new byte[64 * 1024]; // 64KB buffer
                        long bytesRemaining = contentLength;
                        while (bytesRemaining > 0)
                        {
                            int bytesRead = fs.Read(buffer, 0, (int)Math.Min(buffer.Length, bytesRemaining));
                            if (bytesRead == 0)
                                break;

                            response.OutputStream.Write(buffer, 0, bytesRead);
                            bytesRemaining -= bytesRead;
                        }
                    }
                }
                else
                {
                    response.StatusCode = (int)HttpStatusCode.NotFound;
                    using (var writer = new StreamWriter(response.OutputStream))
                    {
                        writer.Write("Video not found.");
                    }
                }
                response.Close();
            }
            catch (HttpListenerException ex)
            {
                // Normal, do nothing.
            }
            catch (Exception ex)
            {
                Log.Error(ex.Message, ex);
            }
        }


        public static void StopServer()
        {
            _httpListener.Stop();
        }
    }
}
