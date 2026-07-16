import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Trash2,
  Settings,
  Music,
  Edit,
  Plus,
  Link as LinkIcon,
  Loader2,
  Volume2,
  VolumeX,
  FileText,
  ListMusic,
  Home,
  CheckCircle,
  HelpCircle
} from "lucide-react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

interface LyricLine {
  text: string;
  startTime: number;
}

interface Song {
  youtubeId: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  cover?: string;
  rawLyrics?: string;
  timedLyrics?: LyricLine[];
}

// Default Sample Playlist
const DEFAULT_PLAYLIST: Song[] = [
  {
    youtubeId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    duration: 212,
    cover: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    rawLyrics: `We're no strangers to love
You know the rules and so do I
A full commitment's what I'm thinking of
You wouldn't get this from any other guy
I just wanna tell you how I'm feeling
Gotta make you understand
Never gonna give you up
Never gonna let you down
Never gonna run around and desert you
Never gonna make you cry
Never gonna say goodbye
Never gonna tell a lie and hurt you`,
    timedLyrics: []
  },
  {
    youtubeId: "L_LUpnjgPso",
    title: "Relaxing Lofi Beat",
    artist: "Lofi Cafe",
    duration: 300,
    cover: "https://img.youtube.com/vi/L_LUpnjgPso/hqdefault.jpg",
    rawLyrics: `歡迎來到舒適的音樂空間
讓思緒隨柔和的節奏漂流
深呼吸 釋放一整天的壓力
這裡只有悠閒與寧靜
適合讀書、工作或靜靜陪伴
聽著雨聲和溫暖的和弦
希望這段旋律能帶給你平靜的夜晚`,
    timedLyrics: []
  }
];

// Helper to format seconds into 00:00 or 00:00:00
const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

// Auto-parse lines of text to equally timed lyric lines
const parseLyricsForTiming = (rawLyrics: string, duration: number): LyricLine[] => {
  if (!rawLyrics) return [];
  const lines = rawLyrics
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0 || duration <= 0) return [];

  const timePerLine = duration / lines.length;
  return lines.map((line, index) => ({
    text: line,
    startTime: index * timePerLine
  }));
};

export default function App() {
  // Load initial states from localStorage if available
  const [playlist, setPlaylist] = useState<Song[]>(() => {
    const saved = localStorage.getItem("ytPlayer_playlist");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Re-generate timed lyrics if needed
          return parsed.map((song) => ({
            ...song,
            timedLyrics: song.timedLyrics?.length
              ? song.timedLyrics
              : parseLyricsForTiming(song.rawLyrics || "", song.duration)
          }));
        }
      } catch (e) {
        console.error(e);
      }
    }
    // Set timing on default playlist
    return DEFAULT_PLAYLIST.map((song) => ({
      ...song,
      timedLyrics: parseLyricsForTiming(song.rawLyrics || "", song.duration)
    }));
  });

  const [currentSongIndex, setCurrentSongIndex] = useState<number>(() => {
    const saved = localStorage.getItem("ytPlayer_currentIndex");
    if (saved) {
      const idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx >= 0) return idx;
    }
    return 0;
  });

  const [totalListeningSeconds, setTotalListeningSeconds] = useState<number>(() => {
    const saved = localStorage.getItem("ytPlayer_listeningSeconds");
    return saved ? parseInt(saved, 10) || 0 : 0;
  });

  const [appBgUrl, setAppBgUrl] = useState<string>(() => {
    return localStorage.getItem("ytPlayer_appBgUrl") || "";
  });

  const [sectionBgUrl, setSectionBgUrl] = useState<string>(() => {
    return localStorage.getItem("ytPlayer_sectionBgUrl") || "";
  });

  // Player operational states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(240);
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);

  // Import controls
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");

  // Modal controls
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditLyricsModal, setShowEditLyricsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Form states
  const [newSongTitle, setNewSongTitle] = useState("");
  const [newSongArtist, setNewSongArtist] = useState("");
  const [newSongVideoId, setNewSongVideoId] = useState("");
  const [newSongDuration, setNewSongDuration] = useState(240);
  const [newSongCover, setNewSongCover] = useState("");

  const [lyricsText, setLyricsText] = useState("");
  const [lyricsDuration, setLyricsDuration] = useState(240);

  // Settings states
  const [tempAppBg, setTempAppBg] = useState(appBgUrl);
  const [tempSectionBg, setTempSectionBg] = useState(sectionBgUrl);

  // References
  const playerRef = useRef<any>(null);
  const iframeReadyRef = useRef<boolean>(false);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const playlistRef = useRef<Song[]>(playlist);
  const currentSongIndexRef = useRef<number>(currentSongIndex);

  // Keep references in sync for closures
  useEffect(() => {
    playlistRef.current = playlist;
    localStorage.setItem("ytPlayer_playlist", JSON.stringify(playlist));
  }, [playlist]);

  useEffect(() => {
    currentSongIndexRef.current = currentSongIndex;
    localStorage.setItem("ytPlayer_currentIndex", currentSongIndex.toString());
  }, [currentSongIndex]);

  useEffect(() => {
    localStorage.setItem("ytPlayer_listeningSeconds", totalListeningSeconds.toString());
  }, [totalListeningSeconds]);

  // Handle accumulative listening duration
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setTotalListeningSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Set up background images
  useEffect(() => {
    if (appBgUrl) {
      document.body.style.backgroundImage = `url(${appBgUrl})`;
    } else {
      document.body.style.backgroundImage = "none";
    }
    localStorage.setItem("ytPlayer_appBgUrl", appBgUrl);
  }, [appBgUrl]);

  useEffect(() => {
    const root = document.documentElement;
    if (sectionBgUrl) {
      root.style.setProperty("--section-background-image-url", `url(${sectionBgUrl})`);
    } else {
      root.style.setProperty("--section-background-image-url", "none");
    }
    localStorage.setItem("ytPlayer_sectionBgUrl", sectionBgUrl);
  }, [sectionBgUrl]);

  // Initialize YouTube Iframe API
  useEffect(() => {
    const initPlayer = () => {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player("youtube-player", {
        height: "0",
        width: "0",
        videoId: playlist[currentSongIndex]?.youtubeId || "",
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: (event: any) => {
            iframeReadyRef.current = true;
            // Set initial duration
            const song = playlistRef.current[currentSongIndexRef.current];
            if (song) {
              setDuration(song.duration || 240);
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            // 1 = playing, 2 = paused, 0 = ended, -1 = unstarted
            if (state === 1) {
              setIsPlaying(true);
              const realDur = playerRef.current?.getDuration();
              if (realDur && realDur > 0) {
                setDuration(realDur);
              }

              // Dynamic metadata self-healing from YouTube Player API
              try {
                if (playerRef.current && typeof playerRef.current.getVideoData === "function") {
                  const data = playerRef.current.getVideoData();
                  if (data && data.title) {
                    const idx = currentSongIndexRef.current;
                    const list = playlistRef.current;
                    if (list[idx] && (list[idx].title.startsWith("YouTube 影片") || list[idx].artist === "YouTube" || list[idx].artist === "未知歌手")) {
                      const updated = [...list];
                      updated[idx] = {
                        ...updated[idx],
                        title: data.title,
                        artist: data.author || "YouTube 創作者",
                        duration: realDur || updated[idx].duration,
                        cover: `https://img.youtube.com/vi/${updated[idx].youtubeId}/hqdefault.jpg`
                      };
                      setPlaylist(updated);
                    }
                  }
                }
              } catch (e) {
                console.error("Failed to heal metadata on state change:", e);
              }
            } else {
              setIsPlaying(false);
            }

            if (state === 0) {
              handleNextSong();
            }
          },
          onError: (event: any) => {
            console.error("YouTube Player Error code:", event.data);
            // Skip broken video
            setTimeout(() => {
              handleNextSong();
            }, 2000);
          }
        }
      });
    };

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }

    window.onYouTubeIframeAPIReady = () => {
      initPlayer();
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    }
  }, []);

  // Sync player when current song index changes
  useEffect(() => {
    if (playerRef.current && iframeReadyRef.current && playlist[currentSongIndex]) {
      const targetId = playlist[currentSongIndex].youtubeId;
      playerRef.current.cueVideoById(targetId);
      setCurrentTime(0);
      setDuration(playlist[currentSongIndex].duration || 240);
      setActiveLyricIndex(-1);
      
      // Auto-play if was already playing or wanted to play
      if (isPlaying) {
        playerRef.current.playVideo();
      }
    }
  }, [currentSongIndex]);

  // Set up timer for checking current playing progress
  useEffect(() => {
    let progressTimer: any;
    if (isPlaying) {
      progressTimer = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
          const curr = playerRef.current.getCurrentTime();
          setCurrentTime(curr);

          // Highlight lyric line matching current time
          const currentSong = playlist[currentSongIndex];
          if (currentSong && currentSong.timedLyrics) {
            let activeIdx = -1;
            for (let i = 0; i < currentSong.timedLyrics.length; i++) {
              if (curr >= currentSong.timedLyrics[i].startTime) {
                activeIdx = i;
              } else {
                break;
              }
            }
            setActiveLyricIndex(activeIdx);
          }
        }
      }, 250);
    }
    return () => clearInterval(progressTimer);
  }, [isPlaying, currentSongIndex, playlist]);

  // Smooth scroll lyrics into view when active lyric line updates
  useEffect(() => {
    if (activeLyricIndex !== -1) {
      const lineElement = document.getElementById(`lyric-line-${activeLyricIndex}`);
      if (lineElement && lyricsContainerRef.current) {
        lineElement.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
    }
  }, [activeLyricIndex]);

  // Core Playback Functions
  const handlePlayPause = () => {
    if (!playerRef.current || !iframeReadyRef.current) return;
    if (playlist.length === 0) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const handleNextSong = () => {
    if (playlist.length === 0) return;
    setCurrentSongIndex((prev) => (prev + 1) % playlist.length);
  };

  const handlePrevSong = () => {
    if (playlist.length === 0) return;
    setCurrentSongIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetVal = parseFloat(e.target.value);
    setCurrentTime(targetVal);
    if (playerRef.current && typeof playerRef.current.seekTo === "function") {
      playerRef.current.seekTo(targetVal, true);
    }
  };

  const toggleMute = () => {
    if (playerRef.current && typeof playerRef.current.mute === "function") {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    }
  };

  // Import / URL Parsing Functionality
  const extractIdOrListId = (urlOrId: string): { type: "playlist" | "video" | "error"; id: string } => {
    const trimmed = urlOrId.trim();
    if (!trimmed) return { type: "error", id: "" };

    // 1. YouTube Playlist URL List parameter check
    const listMatch = trimmed.match(/[?&]list=([^#&?]+)/) || trimmed.match(/playlist\/([^#&?]+)/);
    if (listMatch && listMatch[1]) {
      return { type: "playlist", id: listMatch[1] };
    }

    // 2. YouTube Video URL standard matchers
    const videoMatch = trimmed.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|v\/|watch\?v=|&v=)([^#&?]{11})/);
    if (videoMatch && videoMatch[1]) {
      return { type: "video", id: videoMatch[1] };
    }

    // 3. Fallback: If 11 character string
    if (trimmed.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return { type: "video", id: trimmed };
    }

    return { type: "error", id: "" };
  };

  const handleImportUrl = async () => {
    const parsed = extractIdOrListId(importUrl);
    if (parsed.type === "error") {
      setImportStatus("❌ 無法識別該網址。請貼上 YouTube 播放清單或影片連結！");
      return;
    }

    setIsImporting(true);
    setImportStatus("⏳ 正在由伺服器安全解析 YouTube 資料中...");

    try {
      if (parsed.type === "playlist") {
        const response = await fetch(`/api/parse-playlist?listId=${encodeURIComponent(parsed.id)}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "伺服器解析播放清單失敗");
        }

        const data = await response.json();
        if (data.videos && Array.isArray(data.videos) && data.videos.length > 0) {
          const importedSongs: Song[] = data.videos.map((v: any) => ({
            ...v,
            timedLyrics: parseLyricsForTiming(v.rawLyrics || "", v.duration)
          }));

          setPlaylist((prev) => {
            const updated = [...prev, ...importedSongs];
            return updated;
          });

          setImportStatus(`✅ 成功匯入清單「${data.title || "播放清單"}」共 ${importedSongs.length} 首歌曲！`);
          setImportUrl("");
          
          // If previous list was empty or reset, play first added song
          if (playlist.length === 0) {
            setCurrentSongIndex(0);
          }
        } else {
          throw new Error("此播放清單中未找到影片或格式有誤");
        }
      } else {
        // Single video
        const response = await fetch(`/api/parse-video?videoId=${encodeURIComponent(parsed.id)}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "解析單曲影片失敗");
        }

        const data = await response.json();
        const newSong: Song = {
          ...data,
          timedLyrics: parseLyricsForTiming(data.rawLyrics || "", data.duration)
        };

        setPlaylist((prev) => [...prev, newSong]);
        setImportStatus(`✅ 成功匯入歌曲 「${newSong.title}」！`);
        setImportUrl("");

        if (playlist.length === 0) {
          setCurrentSongIndex(0);
        }
      }
    } catch (err: any) {
      console.error(err);
      // Client-side fallback if server fails
      if (parsed.type === "video") {
        const fallbackSong: Song = {
          youtubeId: parsed.id,
          title: `YouTube 影片 (${parsed.id})`,
          artist: "未知歌手",
          duration: 240,
          cover: `https://img.youtube.com/vi/${parsed.id}/hqdefault.jpg`,
          rawLyrics: "",
          timedLyrics: []
        };
        setPlaylist((prev) => [...prev, fallbackSong]);
        setImportStatus("⚠️ 伺服器忙碌，已使用本機解析加入播放清單。");
        setImportUrl("");
        if (playlist.length === 0) {
          setCurrentSongIndex(0);
        }
      } else {
        setImportStatus(`❌ 解析失敗：${err.message || "未知網路錯誤"}`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Add Song Manually
  const handleAddSongManually = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSongTitle || !newSongVideoId) {
      alert("請至少填寫歌曲名稱與 YouTube 影片 ID！");
      return;
    }

    const cleanedId = newSongVideoId.trim();
    if (cleanedId.length !== 11) {
      alert("YouTube 影片 ID 必須為 11 個字元（如：dQw4w9WgXcQ）");
      return;
    }

    const addedSong: Song = {
      youtubeId: cleanedId,
      title: newSongTitle,
      artist: newSongArtist || "未知歌手",
      duration: newSongDuration || 240,
      cover: newSongCover || `https://img.youtube.com/vi/${cleanedId}/hqdefault.jpg`,
      rawLyrics: "",
      timedLyrics: []
    };

    setPlaylist((prev) => [...prev, addedSong]);
    setShowAddModal(false);
    
    // reset form
    setNewSongTitle("");
    setNewSongArtist("");
    setNewSongVideoId("");
    setNewSongDuration(240);
    setNewSongCover("");

    if (playlist.length === 0) {
      setCurrentSongIndex(0);
    }
  };

  // Delete Song
  const handleDeleteSong = (indexToDelete: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`確定要刪除「${playlist[indexToDelete].title}」嗎？`)) {
      const updated = [...playlist];
      updated.splice(indexToDelete, 1);
      setPlaylist(updated);

      if (updated.length === 0) {
        setCurrentSongIndex(0);
        setIsPlaying(false);
        if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
          playerRef.current.pauseVideo();
        }
      } else if (currentSongIndex === indexToDelete) {
        // If deleted currently playing song, play index 0 or fallback
        const nextIdx = indexToDelete >= updated.length ? 0 : indexToDelete;
        setCurrentSongIndex(nextIdx);
      } else if (currentSongIndex > indexToDelete) {
        setCurrentSongIndex((prev) => prev - 1);
      }
    }
  };

  // Remove duplicates from playlist based on youtubeId
  const handleRemoveDuplicates = () => {
    const seen = new Set<string>();
    const uniqueList: Song[] = [];
    const currentSongId = playlist[currentSongIndex]?.youtubeId;
    let newCurrentIndex = 0;

    playlist.forEach((song) => {
      if (!seen.has(song.youtubeId)) {
        seen.add(song.youtubeId);
        uniqueList.push(song);
      }
    });

    if (uniqueList.length === playlist.length) {
      alert("播放清單中目前沒有重複的歌曲！");
      return;
    }

    // Find new current index
    if (currentSongId) {
      const idx = uniqueList.findIndex((s) => s.youtubeId === currentSongId);
      if (idx !== -1) {
        newCurrentIndex = idx;
      }
    }

    const removedCount = playlist.length - uniqueList.length;
    setPlaylist(uniqueList);
    setCurrentSongIndex(newCurrentIndex);
    alert(`已自動清除重複歌曲，共移除了 ${removedCount} 首重複項目！`);
  };

  // Open Edit Lyrics Modal
  const handleOpenLyricsEditor = () => {
    const currentSong = playlist[currentSongIndex];
    if (!currentSong) return;
    setLyricsText(currentSong.rawLyrics || "");
    setLyricsDuration(currentSong.duration || 240);
    setShowEditLyricsModal(true);
  };

  // Save Edit Lyrics
  const handleSaveLyrics = () => {
    const updated = [...playlist];
    if (updated[currentSongIndex]) {
      updated[currentSongIndex].rawLyrics = lyricsText;
      updated[currentSongIndex].duration = lyricsDuration;
      updated[currentSongIndex].timedLyrics = parseLyricsForTiming(lyricsText, lyricsDuration);
      setPlaylist(updated);
      setDuration(lyricsDuration);
    }
    setShowEditLyricsModal(false);
  };

  // Settings Save
  const handleSaveSettings = () => {
    setAppBgUrl(tempAppBg.trim());
    setSectionBgUrl(tempSectionBg.trim());
    setShowSettingsModal(false);
  };

  const currentSong = playlist[currentSongIndex] || null;

  return (
    <div className="app-container p-4">
      <div className="mobile-frame">
        {/* Header Block */}
        <div className="header">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (window.confirm("是否重設回預設播放清單？")) {
                  setPlaylist(
                    DEFAULT_PLAYLIST.map((song) => ({
                      ...song,
                      timedLyrics: parseLyricsForTiming(song.rawLyrics || "", song.duration)
                    }))
                  );
                  setCurrentSongIndex(0);
                  setIsPlaying(false);
                  if (playerRef.current) playerRef.current.pauseVideo();
                }
              }}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="重設播放清單"
            >
              <Home className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setTempAppBg(appBgUrl);
                setTempSectionBg(sectionBgUrl);
                setShowSettingsModal(true);
              }}
              className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              title="播放器設定"
            >
              <Settings className="w-4 h-4" />
            </button>
            <span className="app-title text-base">Together 🎧</span>
          </div>
          <div className="text-[11px] text-[#B0B0B0] font-medium">
            播放總時長: <span className="text-[#D4A3AE]">{formatTime(totalListeningSeconds)}</span>
          </div>
        </div>

        {/* Main Contents */}
        <div className="main-content">
          {/* IFrame API Hidden Embed */}
          <div className="absolute w-0 h-0 opacity-0 pointer-events-none" id="youtube-player" />

          {/* Vinyl Display & Player Controls */}
          <div className="player-section">
            <div className="vinyl-player-container">
              {/* Rotating Vinyl Cover */}
              <motion.div
                key={currentSongIndex}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className={`vinyl-record ${isPlaying ? "playing" : ""}`}
              >
                <img
                  id="current-song-cover"
                  src={
                    currentSong?.cover ||
                    (currentSong?.youtubeId
                      ? `https://img.youtube.com/vi/${currentSong.youtubeId}/hqdefault.jpg`
                      : "https://via.placeholder.com/150/222222/e0e0f0?text=No+Music")
                  }
                  alt="Song Cover"
                />
              </motion.div>

              {/* Title & Artist */}
              <div className="text-info mt-4 w-full">
                <h2 className="text-sm font-semibold text-[#D4A3AE] truncate px-4 text-center">
                  {currentSong ? currentSong.title : "尚未載入歌曲"}
                </h2>
                <p className="text-xs text-[#B0B0B0] truncate text-center mt-1">
                  {currentSong ? currentSong.artist : "請於播放清單貼上網址匯入或新增新歌"}
                </p>
              </div>
            </div>

            {/* Playback Progress Slider & Buttons */}
            <div className="controls flex flex-col items-center gap-3">
              <div className="control-buttons flex items-center justify-center gap-6 w-full">
                <button
                  onClick={handlePrevSong}
                  className="control-btn"
                  title="上一首"
                  disabled={playlist.length <= 1}
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={handlePlayPause}
                  id="play-pause-btn"
                  className="control-btn"
                  title={isPlaying ? "暫停" : "播放"}
                  disabled={playlist.length === 0}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current text-white" />
                  ) : (
                    <Play className="w-5 h-5 fill-current text-white ml-0.5" />
                  )}
                </button>
                <button
                  onClick={handleNextSong}
                  className="control-btn"
                  title="下一首"
                  disabled={playlist.length <= 1}
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Time progress bar */}
              <div className="progress-container flex items-center gap-3 w-full px-2 mt-1">
                <span className="text-[11px] text-[#B0B0B0] w-10 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  id="progress-bar"
                  min="0"
                  max={duration || 240}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-grow accent-[#D4A3AE] cursor-pointer h-1 bg-white/10 rounded-full"
                />
                <span className="text-[11px] text-[#B0B0B0] w-10 text-left">
                  {formatTime(duration)}
                </span>
                <button
                  onClick={toggleMute}
                  className="text-[#B0B0B0] hover:text-[#D4A3AE] transition-colors p-1"
                  title={isMuted ? "取消靜音" : "靜音"}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Lyrics Board */}
          <div className="lyrics-section">
            <h3>
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="w-4 h-4 text-[#D4A3AE]" />
                音樂歌詞
              </span>
              <button
                onClick={handleOpenLyricsEditor}
                className="text-[11px] bg-[#E6DDC4]/20 hover:bg-[#E6DDC4]/40 text-[#E6DDC4] border border-[#E6DDC4]/30 px-2.5 py-1 rounded-lg transition-colors"
                disabled={!currentSong}
              >
                編輯歌詞
              </button>
            </h3>

            <div
              ref={lyricsContainerRef}
              className="scrollable h-32 overflow-y-auto pr-1 flex flex-col gap-2 py-4"
              style={{ scrollSnapType: "y mandatory" }}
            >
              {currentSong && currentSong.timedLyrics && currentSong.timedLyrics.length > 0 ? (
                currentSong.timedLyrics.map((line, idx) => (
                  <p
                    key={idx}
                    id={`lyric-line-${idx}`}
                    className={`lyric-line ${idx === activeLyricIndex ? "highlighted text-white font-bold scale-105" : "text-[#B0B0B0]/70"}`}
                  >
                    {line.text}
                  </p>
                ))
              ) : (
                <p className="text-center text-[#B0B0B0] text-xs italic py-8">
                  本首歌曲無歌詞。點選「編輯歌詞」即可新增專屬歌詞！
                </p>
              )}
            </div>
          </div>

           {/* Import / Paste Playlist and Main Playlist Board */}
          <div className="playlist-section">
            <h3>
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <ListMusic className="w-4 h-4 text-[#D4A3AE]" />
                播放清單 ({playlist.length})
              </span>
              {playlist.length > 1 && (
                <button
                  onClick={handleRemoveDuplicates}
                  className="text-[11px] bg-[#81A6A0]/20 hover:bg-[#81A6A0]/40 text-[#81A6A0] border border-[#81A6A0]/30 px-2.5 py-1 rounded-lg transition-colors"
                  title="清除清單中所有重複的歌曲"
                >
                  清除重複單曲
                </button>
              )}
            </h3>

            {/* Smart Import Link box (The core new feature) */}
            <div className="flex flex-col gap-2 mb-4 bg-black/45 p-3 rounded-xl border border-white/5">
              <label className="text-[11px] text-[#B0B0B0] font-medium flex items-center gap-1">
                <LinkIcon className="w-3 h-3 text-[#D4A3AE]" />
                貼上 YouTube 播放清單或單曲網址：
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="請貼上播放清單 (list=) 或影片連結..."
                  className="flex-grow bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#81A6A0]"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  disabled={isImporting}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleImportUrl();
                    }
                  }}
                />
                <button
                  onClick={handleImportUrl}
                  className="bg-[#D4A3AE] hover:bg-[#E6DDC4] text-gray-900 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      匯入中
                    </>
                  ) : (
                    "匯入"
                  )}
                </button>
              </div>
              {importStatus && (
                <div className="flex items-start gap-1 mt-1">
                  <p className={`text-[10px] leading-tight ${importStatus.startsWith("❌") ? "text-rose-400" : "text-[#81A6A0]"}`}>
                    {importStatus}
                  </p>
                </div>
              )}
            </div>

            {/* Scrollable Playlist View */}
            <div className="scrollable max-h-[180px] overflow-y-auto pr-1 flex flex-col gap-1.5">
              {playlist.length === 0 ? (
                <p className="text-center text-xs text-[#B0B0B0] py-8 italic">
                  播放清單中尚無歌曲。請貼上網址匯入或點擊下方新增。
                </p>
              ) : (
                playlist.map((song, index) => (
                  <div
                    key={`${song.youtubeId}-${index}`}
                    onClick={() => setCurrentSongIndex(index)}
                    className={`playlist-item flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      index === currentSongIndex
                        ? "bg-[#81A6A0]/15 border-l-4 border-[#81A6A0]"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden pr-2">
                      <img
                        src={song.cover || `https://img.youtube.com/vi/${song.youtubeId}/hqdefault.jpg`}
                        alt=""
                        className="w-10 h-10 object-cover rounded-md"
                        onError={(e) => {
                          e.currentTarget.src = "https://via.placeholder.com/40/222222/ffffff?text=♫";
                        }}
                      />
                      <div className="overflow-hidden">
                        <h4 className={`text-xs font-medium truncate ${index === currentSongIndex ? "text-[#D4A3AE]" : "text-white"}`}>
                          {song.title}
                        </h4>
                        <p className="text-[10px] text-[#B0B0B0] truncate mt-0.5">{song.artist}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[9px] text-[#B0B0B0] font-mono">{formatTime(song.duration)}</span>
                      <button
                        onClick={(e) => handleDeleteSong(index, e)}
                        className="text-white/30 hover:text-rose-400 p-1.5 rounded transition-colors"
                        title="自清單移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="w-full mt-3 p-2 text-xs font-medium bg-[#E6DDC4]/10 hover:bg-[#E6DDC4]/20 text-[#E6DDC4] rounded-xl border border-[#E6DDC4]/20 transition-all flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              手動新增自訂歌曲
            </button>
          </div>
        </div>
      </div>

      {/* --- Add Song Modal --- */}
      <AnimatePresence>
        {showAddModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <button onClick={() => setShowAddModal(false)} className="close-button">
                ×
              </button>
              <h2 className="text-base font-bold text-[#D4A3AE] mb-4 text-center">手動新增歌曲</h2>
              <form onSubmit={handleAddSongManually} className="space-y-3.5">
                <div className="input-group">
                  <label>歌曲名稱 <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="例如: 星月之歌"
                    value={newSongTitle}
                    onChange={(e) => setNewSongTitle(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label>歌手 / 創作者</label>
                  <input
                    type="text"
                    placeholder="例如: 夢境引導者"
                    value={newSongArtist}
                    onChange={(e) => setNewSongArtist(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label>YouTube 影片 ID (11字元) <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="例如: dQw4w9WgXcQ"
                    value={newSongVideoId}
                    onChange={(e) => setNewSongVideoId(e.target.value)}
                  />
                  <p className="text-[9px] text-[#B0B0B0] mt-1 leading-tight">
                    即 YouTube 網址中 watch?v= 後面的 11 碼字母與符號。
                  </p>
                </div>
                <div className="input-group">
                  <label>歌曲長度 (秒)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="240"
                    value={newSongDuration}
                    onChange={(e) => setNewSongDuration(parseInt(e.target.value, 10) || 240)}
                  />
                </div>
                <div className="input-group">
                  <label>封面圖片 URL (選填)</label>
                  <input
                    type="text"
                    placeholder="留空將自動帶入預設 YouTube 封面"
                    value={newSongCover}
                    onChange={(e) => setNewSongCover(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary mt-4">
                  新增並儲存
                </button>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Edit Lyrics Modal --- */}
      <AnimatePresence>
        {showEditLyricsModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <button onClick={() => setShowEditLyricsModal(false)} className="close-button">
                ×
              </button>
              <h2 className="text-base font-bold text-[#D4A3AE] mb-4 text-center">編輯歌曲歌詞</h2>
              <div className="space-y-4">
                <div className="input-group">
                  <label>歌詞文本 (一行一句歌詞，將依長度平均分配顯示時間)：</label>
                  <textarea
                    rows={8}
                    className="font-sans text-xs line-clamp-none w-full"
                    placeholder="請在此輸入歌詞，支援多行輸入..."
                    value={lyricsText}
                    onChange={(e) => setLyricsText(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label>歌曲長度 (秒)：</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="240"
                    value={lyricsDuration}
                    onChange={(e) => setLyricsDuration(parseInt(e.target.value, 10) || 240)}
                  />
                </div>
                <button onClick={handleSaveLyrics} className="btn-primary mt-2">
                  儲存並重新分配時間
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Settings Modal --- */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <button onClick={() => setShowSettingsModal(false)} className="close-button">
                ×
              </button>
              <h2 className="text-base font-bold text-[#D4A3AE] mb-4 text-center">播放器樣式設定</h2>
              <div className="space-y-4">
                <div className="input-group">
                  <label>網頁背景圖片 URL：</label>
                  <input
                    type="text"
                    placeholder="例如：https://example.com/bg.jpg"
                    value={tempAppBg}
                    onChange={(e) => setTempAppBg(e.target.value)}
                  />
                  <p className="text-[9px] text-[#B0B0B0] mt-1 leading-tight">
                    輸入任何可直接連結的圖片網址。留空則恢復預設深黑底色。
                  </p>
                </div>
                <div className="input-group">
                  <label>區塊卡片背景圖片 URL：</label>
                  <input
                    type="text"
                    placeholder="例如：https://example.com/section-bg.jpg"
                    value={tempSectionBg}
                    onChange={(e) => setTempSectionBg(e.target.value)}
                  />
                  <p className="text-[9px] text-[#B0B0B0] mt-1 leading-tight">
                    輸入圖片 URL 更改歌詞與播放清單區塊背景。留空則為預設半透明背景。
                  </p>
                </div>
                <button onClick={handleSaveSettings} className="btn-primary mt-2">
                  儲存並套用
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
