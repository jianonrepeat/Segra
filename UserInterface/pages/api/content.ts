import {NextApiRequest, NextApiResponse} from 'next';
import fs from 'fs';
import path from 'path';

type VideoType = 'video' | 'clip';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Extract 'video' and 'type' from query parameters
  const {fileName, type} = req.query;

  // Ensure 'video' is provided and is a string
  if (typeof fileName !== 'string') {
    res.status(400).send("Missing or invalid 'video' query parameter");
    return;
  }

  // Ensure 'type' is provided and is either 'video' or 'clip'
  if (typeof type !== 'string' || !['video', 'clip'].includes(type)) {
    res.status(400).send("Missing or invalid 'type' query parameter. Must be 'video' or 'clip'");
    return;
  }

  const videoType: VideoType = type as VideoType;

  try {
    // Resolve settings file path
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      res.status(500).send('LOCALAPPDATA environment variable not set');
      return;
    }

    const settingsPath = path.join(localAppData, 'ReCaps', 'settings.json');

    // Read and parse settings.json
    const settingsData = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsData);

    // Ensure VideoFolder is present in settings
    if (!settings.contentFolder) {
      res.status(500).send('ContentFolder not defined in settings.json');
      return;
    }

    // Determine subdirectory based on type
    const subDir = videoType === 'video' ? 'videos' : 'clips';

    // Construct the video path
    const videoPath = path.join(settings.contentFolder, subDir, `${fileName}.mp4`);

    // Check if the video file exists
    if (!fs.existsSync(videoPath)) {
      res.status(404).send(`${videoType.charAt(0).toUpperCase() + videoType.slice(1)} not found`);
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const file = fs.createReadStream(videoPath, {start, end});
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Serve the entire video file
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
}
