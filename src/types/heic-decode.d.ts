declare module "heic-decode" {
  interface DecodedImage {
    width: number
    height: number
    data: Uint8ClampedArray
  }

  interface HeicImage {
    width: number
    height: number
    decode(): Promise<DecodedImage>
  }

  interface HeicImages extends Array<HeicImage> {
    dispose(): void
  }

  function decode(options: { buffer: Buffer | Uint8Array }): Promise<DecodedImage>
  namespace decode {
    function all(options: { buffer: Buffer | Uint8Array }): Promise<HeicImages>
  }
  export = decode
}
