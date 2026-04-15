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
}

interface DownloadResult {
  downloadId?: string;
  title?: string;
  path: string;
  quality: string;
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

interface DownloaderApi {
  selectDownloadDirectory(): Promise<string | null>;
  searchVideos(query: string): Promise<SearchResult[]>;
  fetchVideoInfo(url: string): Promise<VideoInfo>;
  downloadVideo(payload: DownloadRequest): Promise<DownloadResult>;
  onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void;
}

interface Window {
  downloaderApi: DownloaderApi;
}
