import curiousActivist from '../assets/quiz/curious-activist.webp'
import curiousGuardian from '../assets/quiz/curious-guardian.webp'
import curiousPlanner from '../assets/quiz/curious-planner.webp'
import curiousStabilizer from '../assets/quiz/curious-stabilizer.webp'
import enthusiasticExplorer from '../assets/quiz/enthusiastic-explorer.webp'
import enthusiasticGuardian from '../assets/quiz/enthusiastic-guardian.webp'
import enthusiasticPlanner from '../assets/quiz/enthusiastic-planner.webp'
import enthusiasticStabilizer from '../assets/quiz/enthusiastic-stabilizer.webp'
import sereneActivist from '../assets/quiz/serene-activist.webp'
import sereneExplorer from '../assets/quiz/serene-explorer.webp'
import sereneGuardian from '../assets/quiz/serene-guardian.webp'
import serenePlanner from '../assets/quiz/serene-planner.webp'
import steadyActivist from '../assets/quiz/steady-activist.webp'
import steadyExplorer from '../assets/quiz/steady-explorer.webp'
import steadyGuardian from '../assets/quiz/steady-guardian.webp'
import steadyStabilizer from '../assets/quiz/steady-stabilizer.webp'
import warmActivist from '../assets/quiz/warm-activist.webp'
import warmExplorer from '../assets/quiz/warm-explorer.webp'
import warmPlanner from '../assets/quiz/warm-planner.webp'
import warmStabilizer from '../assets/quiz/warm-stabilizer.webp'

type QuizImageAsset = string | { src: string }

const MINI_QUIZ_IMAGES: Record<string, QuizImageAsset> = {
  热情守护者: enthusiasticGuardian,
  热情探索者: enthusiasticExplorer,
  热情规划者: enthusiasticPlanner,
  热情安定者: enthusiasticStabilizer,
  温暖行动派: warmActivist,
  温暖探索者: warmExplorer,
  温暖规划者: warmPlanner,
  温暖安定者: warmStabilizer,
  好奇行动派: curiousActivist,
  好奇守护者: curiousGuardian,
  好奇规划者: curiousPlanner,
  好奇安定者: curiousStabilizer,
  稳健行动派: steadyActivist,
  稳健守护者: steadyGuardian,
  稳健探索者: steadyExplorer,
  稳健安定者: steadyStabilizer,
  从容行动派: sereneActivist,
  从容守护者: sereneGuardian,
  从容探索者: sereneExplorer,
  从容规划者: serenePlanner,
}

export function getMiniQuizImage(personalityType: string | null | undefined) {
  if (!personalityType) return null
  const asset = MINI_QUIZ_IMAGES[personalityType]
  if (!asset) return null
  return typeof asset === 'string' ? asset : asset.src
}
