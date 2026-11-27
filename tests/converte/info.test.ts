import { describe, expect, test } from 'vitest';
import { lerInfoDoFfmpeg } from '../../src/converte/info';

// Saídas reais do `ffmpeg -hide_banner -i <arquivo>` (o código de saída 1 e a última linha "At least one output file" são normais)
const IPHONE_HEVC = `[mov,mp4,m4a,3gp,3g2,mj2 @ 0x5600a0100fc0] Unknown cover type: 0x1.
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/v/IMG_6040.MOV':
  Metadata:
    major_brand     : qt  
    creation_time   : 2026-11-27T16:14:31Z
  Duration: 00:00:26.17, start: 0.000000, bitrate: 11389 kb/s
  Stream #0:0[0x1](eng): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1440x2560, 11257 kb/s, 30 fps, 30 tbr, 1000k tbn (default)
    Metadata:
      handler_name    : VideoHandler
  Stream #0:1[0x2](eng): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 124 kb/s (default)
    Metadata:
      handler_name    : SoundHandler
At least one output file must be specified
`;
const SEM_AUDIO = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sem-audio.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:00:02.00, start: 0.000000, bitrate: 58 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 320x240 [SAR 1:1 DAR 4:3], 53 kb/s, 25 fps, 25 tbr, 12800 tbn (default)
    Metadata:
      handler_name    : VideoHandler
`;
const GIRADO = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'em-pe.mov':
  Duration: 00:00:10.00, start: 0.000000, bitrate: 9000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080, 8800 kb/s, 29.97 fps, 29.97 tbr, 600 tbn (default)
    Metadata:
      handler_name    : Core Media Video
    Side data:
      displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 96 kb/s (default)
`;
const SO_AUDIO = `Input #0, mp3, from 'musica.mp3':
  Duration: 00:03:02.50, start: 0.025057, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
`;
const MP3_COM_CAPA = `Input #0, mp3, from 'musica.mp3':
  Duration: 00:03:02.50, start: 0.025057, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 500x500 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)
`;
const NAO_VIDEO = `[in#0 @ 0x55c482e64ec0] Error opening input: Invalid data found when processing input
Error opening input file falso.mov.
Error opening input files: Invalid data found when processing input
`;
const SEM_DURACAO = `Input #0, matroska,webm, from 'live.mkv':
  Duration: N/A, start: 0.000000, bitrate: N/A
  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv), 640x360, 30 fps, 30 tbr, 1k tbn
`;
const SO_TBR = `Input #0, avi, from 'velho.avi':
  Duration: 00:00:05.00, start: 0.000000, bitrate: 1000 kb/s
  Stream #0:0: Video: mpeg4 (Simple Profile) (FMP4 / 0x34504D46), yuv420p, 640x480 [SAR 1:1 DAR 4:3], 29.97 tbr, 29.97 tbn, 29.97 tbc
`;

describe('lerInfoDoFfmpeg', () => {
  test('vídeo de iPhone em HEVC com áudio AAC', () => {
    expect(lerInfoDoFfmpeg(IPHONE_HEVC)).toEqual({
      contenedor: 'mov',
      duracaoS: 26.17,
      tamanhoBytes: 0,
      video: { codec: 'hevc', largura: 1440, altura: 2560, fps: 30, rotacao: 0 },
      audio: { codec: 'aac' },
    });
  });
  test('vídeo sem áudio: audio é null e fps vem da linha', () => {
    const i = lerInfoDoFfmpeg(SEM_AUDIO)!;
    expect(i.audio).toBeNull();
    expect(i.video).toEqual({ codec: 'h264', largura: 320, altura: 240, fps: 25, rotacao: 0 });
  });
  test('vídeo gravado em pé: rotação 90 (valor absoluto)', () => {
    const i = lerInfoDoFfmpeg(GIRADO)!;
    expect(i.video?.rotacao).toBe(90);
    expect(i.video?.fps).toBe(29.97);
  });
  test('só áudio: video é null', () => {
    const i = lerInfoDoFfmpeg(SO_AUDIO)!;
    expect(i.video).toBeNull();
    expect(i.audio).toEqual({ codec: 'mp3' });
    expect(i.duracaoS).toBe(182.5);
    expect(i.contenedor).toBe('mp3');
  });
  test('capa de álbum (attached pic) não conta como vídeo', () => {
    expect(lerInfoDoFfmpeg(MP3_COM_CAPA)!.video).toBeNull();
  });
  test('arquivo que não é mídia: null', () => {
    expect(lerInfoDoFfmpeg(NAO_VIDEO)).toBeNull();
    expect(lerInfoDoFfmpeg('')).toBeNull();
  });
  test('duração N/A vira 0', () => {
    expect(lerInfoDoFfmpeg(SEM_DURACAO)!.duracaoS).toBe(0);
  });
  test('sem "fps" usa o tbr', () => {
    expect(lerInfoDoFfmpeg(SO_TBR)!.video?.fps).toBe(29.97);
  });
});
