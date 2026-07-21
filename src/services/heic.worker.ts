import { heicTo } from 'heic-to/next';

interface HeicRequest {
  blob: Blob;
  quality: number;
}

interface HeicResponse {
  blob?: Blob;
  error?: string;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<HeicRequest>) => void) | null;
  postMessage: (message: HeicResponse) => void;
};

workerScope.onmessage = (event) => {
  void heicTo({
    blob: event.data.blob,
    type: 'image/jpeg',
    quality: event.data.quality
  })
    .then((blob) => workerScope.postMessage({ blob }))
    .catch((reason: unknown) =>
      workerScope.postMessage({
        error: reason instanceof Error ? reason.message : 'HEIC／HEIFの変換に失敗しました。'
      })
    );
};
