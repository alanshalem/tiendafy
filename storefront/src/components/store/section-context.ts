'use client';

import { createContext, useContext } from 'react';
import type { SectionStyle } from '@/lib/theme';

/**
 * true en la sección que abre la portada: su imagen es la más grande a la
 * vista al cargar (el LCP) y va con prioridad. Antes cualquier hero o
 * carrusel la pedía, aunque estuviera más abajo, y competía con el de arriba.
 */
export const LeadSectionContext = createContext(false);

/**
 * El estilo que el comercio le puso a la sección (alineación, fondo…). Lo
 * aplica SectionFrame; los renderers que quieran respetar la alineación en
 * algo más que el título lo leen con useSectionStyle().
 */
export const SectionStyleContext = createContext<SectionStyle | undefined>(undefined);
export const useSectionStyle = () => useContext(SectionStyleContext);

/**
 * ¿La página de la tienda es oscura (el texto que se le calcula encima es
 * blanco)? Lo provee StorefrontView. Lo leen las secciones que agregan un
 * recuadro pensando en una página clara: sobre una oscura no hace falta, y
 * pisaba lo que había elegido el comercio.
 */
export const DarkPageContext = createContext(false);
export const useDarkPage = () => useContext(DarkPageContext);
