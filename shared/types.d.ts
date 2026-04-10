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

interface DownloadRequest {
  url: string;
  outputDir: string;
  quality: string;
}

interface DownloadResult {
  title?: string;
  path: string;
  quality: string;
}

interface DownloadProgress {
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
