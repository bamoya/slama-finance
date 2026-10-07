/** Release passwords/tokens from mutation state as soon as the workflow receives the result. */
export async function privateMutation<T>(run: () => Promise<T>, reset: () => void): Promise<T> {
  try {
    return await run()
  } finally {
    reset()
  }
}
