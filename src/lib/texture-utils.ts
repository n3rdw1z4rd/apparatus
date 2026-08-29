// import { NearestFilter, RepeatWrapping, Texture, TextureLoader } from "three";

// export interface TextureData {
//     width: number,
//     height: number,
//     texture: Texture<any>,
// }

// export function LoadTexture(url: string): Promise<TextureData> {
//     return new Promise<TextureData>((res, rej) => {
//         (new TextureLoader()).load(
//             url,
//             (texture: Texture<any>) => {
//                 const width = texture.source.data.width;
//                 const height = texture.source.data.height;
//                 res({ width, height, texture });
//             },
//             (_ev) => { },
//             (err) => rej(err),
//         );
//     });
// }

// export function CreateSubTexture(
//     texture: Texture,
//     x: number, y: number,
//     w: number, h: number,
// ): Texture {
//     const subTexture = texture.clone();

//     subTexture.magFilter = NearestFilter;
//     subTexture.wrapS = RepeatWrapping;

//     w /= subTexture.width;
//     h /= subTexture.height;

//     x /= subTexture.width;
//     y = (1 - h) - (y / subTexture.height);

//     subTexture.offset.set(x, y);
//     subTexture.repeat.set(w, h);

//     subTexture.needsUpdate = true;

//     return subTexture;
// }
