'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button';

export function Hero() {
  const reduce = useReducedMotion();
  const fade = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay } };

  return (
    <section className="py-10 sm:py-16">
      <motion.p {...fade(0)} className="text-sm font-medium uppercase tracking-wider text-primary">
        Académie · Laboratoire · Assistant IA · Diagnostic · Certification
      </motion.p>
      <motion.h1 {...fade(0.1)} className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
        Apprendre l&apos;informatique en comprenant chaque geste.
      </motion.h1>
      <motion.p {...fade(0.2)} className="mt-4 max-w-2xl text-lg text-muted-foreground">
        De débutant à ingénieur systèmes, cloud, cybersécurité ou DevOps. Chaque commande est expliquée : pourquoi,
        comment, quand, dans quel contexte, avec quels risques et quelles alternatives.
      </motion.p>
      <motion.div {...fade(0.3)} className="mt-8 flex flex-wrap gap-3">
        <Link href="/diagnostic" className={buttonVariants({ size: 'lg' })}>
          Diagnostiquer une panne
        </Link>
        <Link href="/parcours" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
          Voir les parcours
        </Link>
      </motion.div>
    </section>
  );
}
