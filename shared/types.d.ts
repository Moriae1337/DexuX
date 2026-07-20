interface SearchResult {
  id?: string;
  title: string;
  uploader: string;
  duration: string;
  thumbnail: string | null;
  webpageUrl: string;
}

interface VideoInfo extends SearchResult {
  availableQualities: string[];
}

interface QueueItemStatusDetail {
  label: string;
  tone: 'queued' | 'active' | 'complete' | 'failed';
}

interface QueuedVideo extends SearchResult {
  downloadId: string;
  quality: string;
  status: 'queued' | 'downloading' | 'processing' | 'complete' | 'failed';
  progressPercent: number | null;
  progressText: string;
  savedPath?: string;
  errorMessage?: string;
}

interface DownloadRequest {
  downloadId?: string;
  url: string;
  outputDir: string;
  quality: string;
  referer?: string;
}

interface DownloadResult {
  downloadId?: string;
  title?: string;
  path: string;
  quality: string;
}

interface CapturedMediaDownloadRequest {
  url: string;
  outputDir: string;
  referer?: string;
}

interface DownloadProgress {
  downloadId?: string;
  status: 'downloading' | 'processing';
  percent?: number | null;
  downloaded?: string | null;
  total?: string | null;
  speed?: string | null;
  eta?: number | null;
  message?: string;
}

interface DetectedMedia {
  url: string;
  kind: 'mp4' | 'm3u8';
  sourceUrl?: string | null;
  mimeType?: string | null;
  statusCode?: number | null;
  confidence?: 'confirmed' | 'candidate' | 'blocked';
}

interface DownloaderApi {
  selectDownloadDirectory(): Promise<string | null>;
  searchVideos(query: string): Promise<SearchResult[]>;
  fetchVideoInfo(url: string): Promise<VideoInfo>;
  downloadVideo(payload: DownloadRequest): Promise<DownloadResult>;
  downloadCapturedMedia(payload: CapturedMediaDownloadRequest): Promise<DownloadResult>;
  setWindowOpacity(opacity: number): Promise<number>;
  openExternalUrl(url: string): Promise<void>;
  inspectMediaUrl(url: string): Promise<DetectedMedia[]>;
  startMediaCapture(targetWebContentsId: number): Promise<void>;
  stopMediaCapture(targetWebContentsId: number): Promise<void>;
  onDetectedMedia(callback: (media: DetectedMedia) => void): () => void;
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void;
}

interface Window {
  downloaderApi: DownloaderApi;
}
