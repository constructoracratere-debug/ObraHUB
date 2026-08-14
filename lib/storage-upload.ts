"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FILE_BUCKET } from "@/lib/files";

/**
 * Resumable (TUS) upload directly from the browser to Supabase Storage.
 *
 * Why: Vercel serverless functions cap request bodies at ~4.5MB, so large
 * files (Revit .rvt 50–300MB, big IFC) can never go through the Next API
 * route. Supabase's TUS endpoint (`/storage/v1/upload/resumable`) accepts
 * chunked uploads up to several GB, with automatic retries. After the binary
 * lands in the bucket, the caller registers a metadata row via the tiny
 * `/api/folders/[folderId]/files/register` endpoint (JSON, a few bytes).
 */

export type ResumableUploadResult = {
  storagePath: string;
  sizeBytes: number;
};

export async function uploadFileResumable(
  supabase: SupabaseClient,
  params: {
    file: File;
    storagePath: string;
    onProgress?: (fraction: number) => void;
  },
): Promise<ResumableUploadResult> {
  const { file, storagePath, onProgress } = params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Configuración de almacenamiento ausente");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sesión expirada — inicia sesión de nuevo");

  const { default: tus } = await import("tus-js-client");

  return new Promise<ResumableUploadResult>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024, // 6 MB chunks
      metadata: {
        bucketName: FILE_BUCKET,
        objectName: storagePath,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onProgress: (bytesSent, bytesTotal) => {
        onProgress?.(bytesTotal > 0 ? bytesSent / bytesTotal : 0);
      },
      onSuccess: () => {
        resolve({ storagePath, sizeBytes: file.size });
      },
      onError: (error) => {
        reject(new Error(error?.message || "Error en la subida resumable"));
      },
    });

    // Finds previous partial uploads for this file (resume after a failure).
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (Array.isArray(previous) && previous.length > 0) {
          upload.resumeFromPreviousUpload(previous[0]);
        }
        upload.start();
      })
      .catch(() => {
        upload.start();
      });
  });
}
