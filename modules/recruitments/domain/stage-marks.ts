import type { Stage } from './stages.ts'

/**
 * The icon and colour of each stage (T2-R13, T3-R01, A-R14), the same
 * wherever a stage is shown with an icon: a bookmark for "Do rozważenia",
 * a paper plane for "CV wysłane", a crossed circle for "Odrzucone" and a
 * neutral dash for "Zdjęta z listy". An offer without an application has
 * no icon. Icons are stroke paths on a 24×24 grid.
 */
export const stageMarks: Record<
  Stage,
  { paths: string[]; colour: string; background: string }
> = {
  to_consider: {
    paths: ['M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
    colour: '#1d5fa8',
    background: '#e6effa',
  },
  cv_sent: {
    paths: ['M22 2 11 13', 'M22 2 15 22 11 13 2 9z'],
    colour: '#2f6b3f',
    background: '#e3f0e3',
  },
  rejected: {
    paths: ['M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0z', 'M4.9 4.9l14.2 14.2'],
    colour: '#a1302a',
    background: '#f9e3e1',
  },
  removed: {
    paths: ['M6 12h12'],
    colour: '#6b7280',
    background: '#eef0f2',
  },
}
