import SparkMD5 from 'spark-md5'

const CHUNK_SIZE = 2 * 1024 * 1024

/**
 * Hex MD5 of a Blob, read in 2 MB slices so large books never sit in memory at once.
 * onProgress(done, total) runs after each slice with bytes consumed so far.
 */
export async function md5Hex(blob: Blob, onProgress?: (done: number, total: number) => void): Promise<string> {
  const spark = new SparkMD5.ArrayBuffer()
  const total = blob.size
  let done = 0
  while (done < total) {
    const end = Math.min(done + CHUNK_SIZE, total)
    spark.append(await blob.slice(done, end).arrayBuffer())
    done = end
    onProgress?.(done, total)
  }
  return spark.end()
}
