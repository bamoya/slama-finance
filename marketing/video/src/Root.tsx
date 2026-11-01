import { Composition, staticFile, type CalculateMetadataFunction } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { Chapter, type ChapterProps } from './components/Chapter'
import { Intro, Outro } from './components/Intro'
import { chapters, sourceFor, type Timeline } from './config'
import { CROSSFADE_FRAMES, FPS, INTRO_FRAMES, OUTRO_FRAMES } from './theme'

const loadTimeline = async (path: string): Promise<Timeline> => {
  const res = await fetch(staticFile(path))
  return (await res.json()) as Timeline
}

const chapterFrames = (tl: Timeline) => Math.max(FPS, Math.ceil(tl.duration * FPS))

const chapterMeta =
  (index: number): CalculateMetadataFunction<ChapterProps> =>
  async () => {
    const source = sourceFor(chapters[index].id)
    const timeline = await loadTimeline(source.timeline)
    return {
      durationInFrames: chapterFrames(timeline),
      props: { chapter: chapters[index], index, source, timeline },
    }
  }

type TourProps = { items: ChapterProps[] }

const tourMeta: CalculateMetadataFunction<TourProps> = async () => {
  const items = await Promise.all(
    chapters.map(async (chapter, index) => {
      const source = sourceFor(chapter.id)
      return { chapter, index, source, timeline: await loadTimeline(source.timeline) }
    }),
  )
  const total =
    INTRO_FRAMES +
    OUTRO_FRAMES +
    items.reduce((n, i) => n + chapterFrames(i.timeline), 0) -
    CROSSFADE_FRAMES * items.length
  return { durationInFrames: total, props: { items } }
}

const timing = linearTiming({ durationInFrames: CROSSFADE_FRAMES })

const Tour = ({ items }: TourProps) => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={INTRO_FRAMES}>
      <Intro />
    </TransitionSeries.Sequence>
    {items.flatMap((item) => [
      <TransitionSeries.Transition
        key={`t-${item.chapter.id}`}
        presentation={fade()}
        timing={timing}
      />,
      <TransitionSeries.Sequence
        key={item.chapter.id}
        durationInFrames={chapterFrames(item.timeline)}
      >
        <Chapter {...item} />
      </TransitionSeries.Sequence>,
    ])}
    <TransitionSeries.Transition presentation={fade()} timing={timing} />
    <TransitionSeries.Sequence durationInFrames={OUTRO_FRAMES}>
      <Outro />
    </TransitionSeries.Sequence>
  </TransitionSeries>
)

const placeholderProps = (index: number): ChapterProps => ({
  chapter: chapters[index],
  index,
  source: sourceFor(chapters[index].id),
  timeline: { duration: 12, events: [] },
})

const sizes = [
  { suffix: '', width: 1920, height: 1080 },
  { suffix: '-Square', width: 1080, height: 1080 },
]

export const Root = () => (
  <>
    {sizes.flatMap(({ suffix, width, height }) => [
      ...chapters.map((c, i) => (
        <Composition
          key={c.compositionId + suffix}
          id={c.compositionId + suffix}
          component={Chapter}
          width={width}
          height={height}
          fps={FPS}
          durationInFrames={360}
          defaultProps={placeholderProps(i)}
          calculateMetadata={chapterMeta(i)}
        />
      )),
      <Composition
        key={`tour${suffix}`}
        id={`Visite-complete${suffix}`}
        component={Tour}
        width={width}
        height={height}
        fps={FPS}
        durationInFrames={600}
        defaultProps={{ items: [] } as TourProps}
        calculateMetadata={tourMeta}
      />,
      <Composition
        key={`intro${suffix}`}
        id={`Intro${suffix}`}
        component={Intro}
        width={width}
        height={height}
        fps={FPS}
        durationInFrames={INTRO_FRAMES}
      />,
      <Composition
        key={`outro${suffix}`}
        id={`Outro${suffix}`}
        component={Outro}
        width={width}
        height={height}
        fps={FPS}
        durationInFrames={OUTRO_FRAMES}
      />,
    ])}
  </>
)
