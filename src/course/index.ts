import { createCourseManager } from './CourseManager'
import { touge01 } from './courses/touge01'
import { sampleGeoCourse } from './courses/sampleGeoCourse'

export const courseManager = createCourseManager().register(touge01).register(sampleGeoCourse)
export const DEFAULT_COURSE_ID = touge01.id
export * from './types'
export * from './CourseManager'
