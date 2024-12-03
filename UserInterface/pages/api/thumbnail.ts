import {NextApiRequest, NextApiResponse} from 'next';
import fs from 'fs';
import path from 'path';

type VideoType = 'video' | 'clip';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Extract 'input' and 'type' from query parameters
  const {input, type} = req.query;

  // Ensure 'input' is provided and is a string
  if (typeof input !== 'string') {
    res.status(400).send("Missing or invalid 'input' query parameter");
    return;
  }

  // Ensure 'type' is provided and is either 'video' or 'clip'
  if (typeof type !== 'string' || !['video', 'clip'].includes(type)) {
    res.status(400).send("Missing or invalid 'type' query parameter. Must be 'video' or 'clip'");
    return;
  }

  const videoType: VideoType = type as VideoType;

  // Sanitize the input to prevent directory traversal attacks
  const sanitizedInput = path.basename(input);

  // Append '.png' to the sanitized input
  const filenameWithExtension = `${sanitizedInput}.png`;

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

    // Ensure contentFolder is present in settings
    if (!settings.contentFolder) {
      res.status(500).send('VideoFolder not defined in settings.json');
      return;
    }

    // Determine subdirectory based on type
    const subDir = videoType === 'video' ? 'videos' : 'clips';

    // Construct the thumbnail directory
    const thumbnailDir = path.join(settings.contentFolder, '.thumbnails', subDir);

    // Construct the file path
    const filePath = path.join(thumbnailDir, filenameWithExtension);

    // Check if the file exists and is a file
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.status(404).send(`${videoType.charAt(0).toUpperCase() + videoType.slice(1)} thumbnail not found`);
        return;
      }

      // Set the content type for PNG images
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', stats.size);

      // Stream the file to the response
      const readStream = fs.createReadStream(filePath);

      readStream.on('error', (streamErr) => {
        console.error('Stream Error:', streamErr);
        res.status(500).send('Internal Server Error');
      });

      readStream.pipe(res);
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
}
