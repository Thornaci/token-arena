import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { lessonSchema } from '@/content/schema';

export const collections = {
  lessons: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/content/lessons' }),
    schema: lessonSchema,
  }),
};
