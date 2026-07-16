import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Helper function to recursively find all playlistVideoRenderer objects
function findPlaylistVideos(obj: any, results: any[] = []) {
  if (!obj || typeof obj !== "object") return results;

  if (obj.playlistVideoRenderer) {
    const r = obj.playlistVideoRenderer;
    const videoId = r.videoId;
    if (videoId) {
      const title = r.title?.runs?.[0]?.text || r.title?.simpleText || "未命名影片";
      const artist = r.shortBylineText?.runs?.[0]?.text || r.shortBylineText?.simpleText || "未知歌手";

      // Parse duration text like "4:32"
      const lengthStr = r.lengthText?.simpleText || r.lengthText?.accessibility?.accessibilityData?.label || "";
      let duration = 240; // Fallback to 4 minutes
      if (lengthStr) {
        const parts = lengthStr.split(":").map((p: string) => parseInt(p, 10));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          duration = parts[0] * 60 + parts[1];
        } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }

      const thumbnails = r.thumbnail?.thumbnails || [];
      const cover = thumbnails[thumbnails.length - 1]?.url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      results.push({
        youtubeId: videoId,
        title,
        artist,
        duration,
        cover,
        rawLyrics: "",
        timedLyrics: []
      });
    }
  } else {
    for (const key of Object.keys(obj)) {
      try {
        findPlaylistVideos(obj[key], results);
      } catch (e) {
        // Ignore cyclic refs or other issues
      }
    }
  }
  return results;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Parse YouTube Playlist
  app.get("/api/parse-playlist", async (req, res) => {
    const { listId } = req.query;
    if (!listId || typeof listId !== "string") {
      return res.status(400).json({ error: "Missing or invalid listId parameter" });
    }

    try {
      const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
      const response = await fetch(playlistUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch playlist page: ${response.statusText}`);
      }

      const html = await response.text();
      
      // Safely extract ytInitialData using substring matching to avoid regex backtracking or stack overflow on huge HTML
      let ytDataStr = "";
      const markers = [
        "window[\"ytInitialData\"] =",
        "window['ytInitialData'] =",
        "ytInitialData =",
        "var ytInitialData ="
      ];

      for (const marker of markers) {
        const idx = html.indexOf(marker);
        if (idx !== -1) {
          const start = html.indexOf("{", idx);
          if (start !== -1) {
            const scriptEnd = html.indexOf("</script>", start);
            if (scriptEnd !== -1) {
              let chunk = html.substring(start, scriptEnd).trim();
              if (chunk.endsWith(";")) {
                chunk = chunk.slice(0, -1).trim();
              }
              // Attempt to find the largest valid JSON chunk working backwards
              let lastBrace = chunk.lastIndexOf("}");
              while (lastBrace !== -1) {
                const subChunk = chunk.substring(0, lastBrace + 1);
                try {
                  JSON.parse(subChunk);
                  ytDataStr = subChunk;
                  break;
                } catch (err) {
                  lastBrace = chunk.lastIndexOf("}", lastBrace - 1);
                }
              }
            }
          }
        }
        if (ytDataStr) break;
      }

      let videos: any[] = [];
      let playlistTitle = "YouTube 播放清單";

      if (ytDataStr) {
        try {
          const ytData = JSON.parse(ytDataStr);
          const rawVideos = findPlaylistVideos(ytData);
          
          // Filter duplicates and populate
          const seen = new Set<string>();
          for (const v of rawVideos) {
            if (!seen.has(v.youtubeId)) {
              seen.add(v.youtubeId);
              videos.push(v);
            }
          }

          playlistTitle = ytData.metadata?.playlistMetadataRenderer?.title || ytData.title || "YouTube 播放清單";
        } catch (e) {
          console.error("JSON parsing of ytInitialData failed, falling back to regex", e);
        }
      }

      // If JSON parsing yielded no videos, fallback to regex extraction on raw HTML
      if (videos.length === 0) {
        console.log("No videos found from JSON. Falling back to regex extraction on raw HTML.");
        const seen = new Set<string>();
        
        // Find playlistVideoRenderer videoId patterns
        const pvrRegex = /"playlistVideoRenderer"\s*:\s*\{\s*"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
        let pvrMatch;
        while ((pvrMatch = pvrRegex.exec(html)) !== null) {
          const videoId = pvrMatch[1];
          if (videoId && !seen.has(videoId)) {
            seen.add(videoId);
            videos.push({
              youtubeId: videoId,
              title: `YouTube 影片 (${videoId})`,
              artist: "YouTube",
              duration: 240,
              cover: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
              rawLyrics: "",
              timedLyrics: []
            });
          }
        }

        // Broad fallback: any watch URL or videoId key
        if (videos.length === 0) {
          const generalRegex = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
          let genMatch;
          while ((genMatch = generalRegex.exec(html)) !== null) {
            const videoId = genMatch[1];
            if (videoId && !seen.has(videoId)) {
              seen.add(videoId);
              videos.push({
                youtubeId: videoId,
                title: `YouTube 影片 (${videoId})`,
                artist: "YouTube",
                duration: 240,
                cover: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                rawLyrics: "",
                timedLyrics: []
              });
            }
          }
        }
      }

      if (videos.length === 0) {
        return res.status(404).json({ error: "無法從該網址解析出任何 YouTube 影片，請檢查網址或嘗試其他播放清單！" });
      }

      res.json({
        title: playlistTitle,
        videos
      });
    } catch (error: any) {
      console.error("Error parsing playlist:", error);
      res.status(500).json({ error: error.message || "Failed to parse playlist" });
    }
  });

  // API Route: Parse Single YouTube Video Metadata
  app.get("/api/parse-video", async (req, res) => {
    const { videoId } = req.query;
    if (!videoId || typeof videoId !== "string" || videoId.length !== 11) {
      return res.status(400).json({ error: "Invalid videoId" });
    }

    try {
      const embedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      const response = await fetch(embedUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch video metadata");
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      res.json({
        youtubeId: videoId,
        title: data.title || "未命名影片",
        artist: data.author_name || "未知歌手",
        duration: 240, // default fallback
        cover: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        rawLyrics: "",
        timedLyrics: []
      });
    } catch (error: any) {
      console.error("Error parsing video:", error);
      res.status(500).json({ error: error.message || "Failed to parse video metadata" });
    }
  });

  // Vite development middleware or production static files serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
