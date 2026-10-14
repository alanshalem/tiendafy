/**
 * Qué links de video se pueden embeber en la tienda. Antes un Short, un
 * /embed/ o un link de m.youtube.com iban crudos al iframe y la CSP los
 * bloqueaba: la tienda mostraba un recuadro gris.
 */
import { parseVideoEmbed } from '@tiendafy/types';
import { describe, expect, it } from 'vitest';

const ID = 'dQw4w9WgXcQ';
const nocookie = (q = 'rel=0') => `https://www.youtube-nocookie.com/embed/${ID}?${q}`;

describe('parseVideoEmbed', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?feature=share&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ])('YouTube: %s va por youtube-nocookie', (url) => {
    expect(parseVideoEmbed(url)).toEqual({ kind: 'youtube', id: ID, short: false, src: nocookie() });
  });

  it('un Short es vertical', () => {
    expect(parseVideoEmbed(`https://youtube.com/shorts/${ID}?si=abc`)).toEqual({
      kind: 'youtube',
      id: ID,
      short: true,
      src: nocookie(),
    });
  });

  it('respeta el minuto de inicio', () => {
    expect(parseVideoEmbed(`https://youtu.be/${ID}?t=90`)).toMatchObject({ src: nocookie('rel=0&start=90') });
    expect(parseVideoEmbed(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toMatchObject({
      src: nocookie('rel=0&start=90'),
    });
    expect(parseVideoEmbed(`https://www.youtube.com/watch?v=${ID}&t=raro`)).toMatchObject({
      src: nocookie(),
    });
  });

  it('Vimeo, también privado y de canales', () => {
    expect(parseVideoEmbed('https://vimeo.com/123456')).toEqual({
      kind: 'vimeo',
      id: '123456',
      src: 'https://player.vimeo.com/video/123456?dnt=1',
    });
    expect(parseVideoEmbed('https://vimeo.com/123456/abcdef1234')).toMatchObject({
      src: 'https://player.vimeo.com/video/123456?dnt=1&h=abcdef1234',
    });
    expect(parseVideoEmbed('https://vimeo.com/channels/staffpicks/987')).toMatchObject({ id: '987' });
    expect(parseVideoEmbed('https://player.vimeo.com/video/55?h=ff00ff')).toMatchObject({
      src: 'https://player.vimeo.com/video/55?dnt=1&h=ff00ff',
    });
  });

  it('Instagram: publicación, reel y links con el usuario adelante', () => {
    const post = { kind: 'instagram', id: 'Cx1-ab_C', src: 'https://www.instagram.com/p/Cx1-ab_C/embed' };
    expect(parseVideoEmbed('https://www.instagram.com/p/Cx1-ab_C/')).toEqual(post);
    expect(parseVideoEmbed('https://instagram.com/reel/Cx1-ab_C?igsh=x')).toEqual(post);
    expect(parseVideoEmbed('https://www.instagram.com/tienda/reel/Cx1-ab_C/')).toEqual(post);
    expect(parseVideoEmbed('instagram.com/tv/Cx1-ab_C')).toEqual(post);
  });

  it('Instagram: un perfil es una tarjeta (el feed no se puede embeber)', () => {
    expect(parseVideoEmbed('https://instagram.com/tienda.oficial?hl=es')).toEqual({
      kind: 'instagram-profile',
      user: 'tienda.oficial',
      href: 'https://instagram.com/tienda.oficial',
    });
    expect(parseVideoEmbed('https://www.instagram.com/explore/')).toBeNull();
  });

  it.each([
    '',
    '   ',
    'no es un link',
    'https://www.youtube.com/watch?v=corto',
    'https://www.youtube.com/channel/UC123',
    'https://vimeo.com/about',
    'https://tiktok.com/@tienda/video/1',
    'https://otra-pagina.com/video.mp4',
    'javascript:alert(1)',
    'ftp://youtube.com/watch?v=' + ID,
  ])('%j no se puede embeber', (url) => {
    expect(parseVideoEmbed(url)).toBeNull();
  });

  it('lo que no es texto tampoco', () => {
    expect(parseVideoEmbed(null)).toBeNull();
    expect(parseVideoEmbed(42)).toBeNull();
  });
});
