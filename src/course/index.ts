import { createCourseManager } from './CourseManager'
import { touge01 } from './courses/touge01'
import { sampleGeoCourse } from './courses/sampleGeoCourse'
import { bimBridgeCourse } from './courses/bimBridgeCourse'
import { loop01 } from './courses/loop01'

export const courseManager = createCourseManager().register(touge01).register(sampleGeoCourse).register(bimBridgeCourse).register(loop01)
export const DEFAULT_COURSE_ID = touge01.id
export * from './types'
export * from './CourseManager'
