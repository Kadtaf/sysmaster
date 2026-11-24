'use client';

import { DIFFICULTIES, LAB_CATEGORIES, type LabCheck, type LabContent } from '@sysmaster/contracts';
import { useState } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { difficultyLabel, labCategoryLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { Field, FormProps, inputClass, LinesInput, ListEditor } from './form-kit';

type Validator = LabContent['validators'][number];

const CHECK_LABELS: Record<LabCheck['kind'], string> = {
  service_active: 'Service démarré',
  service_enabled: 'Service activé (ou non) au démarrage',
  disk_usage_below: 'Occupation d’un disque sous un seuil',
  path_exists: 'Fichier ou répertoire présent (ou absent)',
  host_reachable: 'Hôte joignable (nom ou adresse)',
  name_resolves: 'Nom résolu par le DNS',
  file_has_line: 'Ligne active présente (ou absente) dans un fichier',
  container_running: 'Conteneur démarré (ou non)',
  container_autostart: 'Conteneur relancé (ou non) au démarrage du serveur',
  http_ok: 'URL qui répond (et contient un texte)',
  file_mode_at_most: 'Droits d’un fichier au plus égaux à',
  file_readable_by: 'Fichier lisible (ou non) par un compte',
  firewall_allows: 'Pare-feu qui laisse passer (ou bloque) une origine',
};

const defaultCheck = (kind: LabCheck['kind']): LabCheck => {
  switch (kind) {
    case 'service_active': return { kind, service: '' };
    case 'service_enabled': return { kind, service: '', expected: true };
    case 'disk_usage_below': return { kind, mount: '/', percent: 90 };
    case 'path_exists': return { kind, path: '/', expected: true };
    case 'host_reachable': return { kind, target: '' };
    case 'name_resolves': return { kind, name: '' };
    case 'file_has_line': return { kind, path: '/etc/', line: '', expected: true };
    case 'container_running': return { kind, name: '', expected: true };
    case 'container_autostart': return { kind, name: '', expected: false };
    case 'http_ok': return { kind, url: 'http://localhost:8080', contains: '' };
    case 'file_mode_at_most': return { kind, path: '/etc/', mode: '640' };
    case 'file_readable_by': return { kind, path: '/etc/', user: 'www-data', expected: true };
    case 'firewall_allows': return { kind, from: '', port: 22, expected: false };
  }
};

const emptyValidator: Validator = { description: '', check: { kind: 'service_active', service: '' } };

function CheckEditor({ check, set, ro }: { check: LabCheck; set: (c: LabCheck) => void; ro: boolean }) {
  const small = 'rounded-md border bg-background px-2 py-1 text-xs';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Type de vérification" value={check.kind} disabled={ro} onChange={(e) => set(defaultCheck(e.target.value as LabCheck['kind']))} className={small}>
        {Object.entries(CHECK_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {(check.kind === 'service_active' || check.kind === 'service_enabled') && (
        <input aria-label="Service" placeholder="nginx" value={check.service} disabled={ro} onChange={(e) => set({ ...check, service: e.target.value })} className={cn(small, 'font-mono')} />
      )}
      {check.kind === 'disk_usage_below' && (
        <>
          <input aria-label="Point de montage" value={check.mount} disabled={ro} onChange={(e) => set({ ...check, mount: e.target.value })} className={cn(small, 'font-mono')} />
          <input aria-label="Seuil en %" type="number" min={1} max={100} value={check.percent} disabled={ro} onChange={(e) => set({ ...check, percent: Number(e.target.value) })} className={cn(small, 'w-20')} />
        </>
      )}
      {(check.kind === 'path_exists' || check.kind === 'file_has_line' || check.kind === 'file_mode_at_most' || check.kind === 'file_readable_by') && (
        <input aria-label="Chemin" value={check.path} disabled={ro} onChange={(e) => set({ ...check, path: e.target.value })} className={cn(small, 'font-mono')} />
      )}
      {check.kind === 'file_has_line' && (
        <input aria-label="Ligne" placeholder="gateway 10.0.0.1" value={check.line} disabled={ro} onChange={(e) => set({ ...check, line: e.target.value })} className={cn(small, 'font-mono')} />
      )}
      {check.kind === 'file_mode_at_most' && (
        <input aria-label="Droits au plus" placeholder="640" maxLength={3} value={check.mode} disabled={ro} onChange={(e) => set({ ...check, mode: e.target.value })} className={cn(small, 'w-16 font-mono')} />
      )}
      {check.kind === 'file_readable_by' && (
        <input aria-label="Compte" placeholder="www-data" value={check.user} disabled={ro} onChange={(e) => set({ ...check, user: e.target.value })} className={cn(small, 'font-mono')} />
      )}
      {check.kind === 'firewall_allows' && (
        <>
          <input aria-label="Adresse d’origine" placeholder="203.0.113.45" value={check.from} disabled={ro} onChange={(e) => set({ ...check, from: e.target.value })} className={cn(small, 'font-mono')} />
          <input aria-label="Port" type="number" min={1} max={65535} value={check.port} disabled={ro} onChange={(e) => set({ ...check, port: Number(e.target.value) })} className={cn(small, 'w-24')} />
        </>
      )}
      {check.kind === 'host_reachable' && (
        <input aria-label="Hôte" placeholder="deb.debian.org" value={check.target} disabled={ro} onChange={(e) => set({ ...check, target: e.target.value })} className={cn(small, 'font-mono')} />
      )}
      {check.kind === 'name_resolves' && (
        <input aria-label="Nom" placeholder="depot.exemple.fr" value={check.name} disabled={ro} onChange={(e) => set({ ...check, name: e.target.value })} className={cn(small, 'font-mono')} />
      )}
      {(check.kind === 'container_running' || check.kind === 'container_autostart') && (
        <input aria-label="Conteneur" placeholder="projet-app-1" value={check.name} disabled={ro} onChange={(e) => set({ ...check, name: e.target.value })} className={cn(small, 'font-mono')} />
      )}
      {check.kind === 'http_ok' && (
        <>
          <input aria-label="URL" value={check.url} disabled={ro} onChange={(e) => set({ ...check, url: e.target.value })} className={cn(small, 'font-mono')} />
          <input aria-label="Texte attendu" placeholder="texte attendu (facultatif)" value={check.contains ?? ''} disabled={ro} onChange={(e) => set({ ...check, contains: e.target.value || undefined })} className={small} />
        </>
      )}
      {(check.kind === 'service_enabled' || check.kind === 'path_exists' || check.kind === 'file_has_line' || check.kind === 'container_running' || check.kind === 'container_autostart' || check.kind === 'firewall_allows' || check.kind === 'file_readable_by') && (
        <select aria-label="Attendu" value={String(check.expected)} disabled={ro} onChange={(e) => set({ ...check, expected: e.target.value === 'true' })} className={small}>
          <option value="true">{check.kind === 'firewall_allows' ? 'laisse passer' : check.kind === 'file_readable_by' ? 'lisible' : check.kind === 'service_enabled' || check.kind === 'container_autostart' ? 'oui' : check.kind === 'container_running' ? 'démarré' : 'présent'}</option>
          <option value="false">{check.kind === 'firewall_allows' ? 'bloque' : check.kind === 'file_readable_by' ? 'illisible' : check.kind === 'service_enabled' || check.kind === 'container_autostart' ? 'non' : check.kind === 'container_running' ? 'arrêté' : 'absent'}</option>
        </select>
      )}
    </div>
  );
}

/**
 * La machine est éditée en JSON : c'est l'outil le plus direct pour décrire fichiers, montages et
 * services. Le texte n'est repris dans le contenu que s'il est du JSON valide ; la forme précise
 * est vérifiée à l'enregistrement.
 */
function MachineEditor({ value, onChange, ro, issue }: { value: LabContent['machine']; onChange: (m: LabContent['machine']) => void; ro: boolean; issue: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <Field
      label="Machine de départ (JSON)"
      hint="L’état EN PANNE : répertoires, fichiers (taille en octets, contenu affiché), montages, services (actif, activé, ports, fichier écrit au démarrage, journal) et, si besoin, réseau (interfaces, routes, hôtes du monde simulé avec leurs enregistrements DNS et leur réponse web) Docker (images avec leurs variables obligatoires, conteneurs, fichier compose) et pare-feu (actif, politique par défaut, règles appliquées dans l’ordre). Chaque fichier peut porter ses droits en octal (mode, ex. 640), son propriétaire et son groupe ; un service peut tourner sous un compte (user) qui doit pouvoir lire ses fichiers indispensables."
      issue={issue}
    >
      <textarea
        aria-label="Machine de départ"
        rows={18}
        value={text}
        disabled={ro}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'JSON invalide');
          }
        }}
        className={cn(inputClass, 'font-mono text-xs')}
      />
      {error && <span role="alert" className="mt-1 block text-xs text-red-600">JSON invalide, non repris : {error}</span>}
    </Field>
  );
}

/** Formulaire d'un lab simulé : situation, machine en panne, validateurs, démarche de référence, indices, solution. */
export function LabForm({ c, set, ro, flagged, isNew }: FormProps<LabContent>) {
  return (
    <>
      <Card className="space-y-4">
        <CardTitle>Présentation</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre" issue={flagged('title')}><input value={c.title} disabled={ro} onChange={(e) => set('title', e.target.value)} className={inputClass} /></Field>
          <Field label="Identifiant d’URL" hint={isNew ? 'ex. linux-disque-plein-nginx' : 'fixe pour un lab publié'} issue={flagged('slug')}>
            <input value={c.slug} disabled={ro || !isNew} onChange={(e) => set('slug', e.target.value)} className={cn(inputClass, 'font-mono')} />
          </Field>
          <Field label="Catégorie">
            <select value={c.category} disabled={ro} onChange={(e) => set('category', e.target.value as LabContent['category'])} className={inputClass}>
              {LAB_CATEGORIES.map((k) => <option key={k} value={k}>{labCategoryLabel[k]}</option>)}
            </select>
          </Field>
          <Field label="Difficulté">
            <select value={c.difficulty} disabled={ro} onChange={(e) => set('difficulty', e.target.value as LabContent['difficulty'])} className={inputClass}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{difficultyLabel[d]}</option>)}
            </select>
          </Field>
          <Field label="Durée d’une session (minutes)">
            <input type="number" min={10} max={240} value={c.ttlMinutes} disabled={ro} onChange={(e) => set('ttlMinutes', Number(e.target.value))} className={inputClass} />
          </Field>
        </div>
        <Field label="Situation (Markdown)" hint="Racontez l’incident comme un ticket : ce que voit l’utilisateur, ce qu’on attend. Ne donnez pas la cause." issue={flagged('briefMd')}>
          <textarea rows={6} value={c.briefMd} disabled={ro} onChange={(e) => set('briefMd', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Objectifs d’apprentissage (un par ligne)" issue={flagged('objectives')}>
          <LinesInput label="Objectifs" value={c.objectives} disabled={ro} onChange={(v) => set('objectives', v)} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <CardTitle>La panne</CardTitle>
        <CardDescription>
          Décrivez la machine déjà en panne. Les causes d’échec au démarrage d’un service sont génériques : port déjà écouté par un autre service actif,
          disque plein là où il écrit (« writes »), fichier indispensable absent (« needsFiles »).
        </CardDescription>
        <MachineEditor value={c.machine} onChange={(m) => set('machine', m)} ro={ro} issue={flagged('machine')} />
        <ListEditor<Validator>
          title="Ce qui sera vérifié" hint="Le résultat attendu, pas la méthode : l’apprenant peut réparer autrement que vous."
          issue={flagged('validators')} addLabel="Ajouter une vérification" items={c.validators} disabled={ro} empty={emptyValidator}
          onChange={(v) => set('validators', v)}
          render={(v, upd) => (
            <div className="space-y-2">
              <input aria-label="Description" placeholder="nginx est démarré" value={v.description} disabled={ro} onChange={(e) => upd({ ...v, description: e.target.value })} className={inputClass} />
              <CheckEditor check={v.check} set={(check) => upd({ ...v, check })} ro={ro} />
            </div>
          )}
        />
        <Field
          label="Démarche de référence (une commande par ligne)"
          hint="Rejouée à chaque enregistrement : le lab n’est publiable que si elle répare la machine."
          issue={flagged('walkthrough')}
        >
          <LinesInput label="Démarche de référence" rows={6} value={c.walkthrough} disabled={ro} onChange={(v) => set('walkthrough', v)} />
        </Field>
      </Card>

      <Card className="space-y-4">
        <CardTitle>Aide et explication</CardTitle>
        <Field label="Indices (un par ligne, du plus général au plus précis)" hint="Chaque indice révélé coûte des points à l’apprenant." issue={flagged('hints')}>
          <LinesInput label="Indices" rows={4} value={c.hints} disabled={ro} onChange={(v) => set('hints', v)} />
        </Field>
        <Field label="Solution expliquée (Markdown)" hint="Montrée après la réussite : la cause, la démarche, ce qu’il ne fallait pas faire, comment éviter que ça revienne." issue={flagged('solutionMd')}>
          <textarea rows={8} value={c.solutionMd} disabled={ro} onChange={(e) => set('solutionMd', e.target.value)} className={inputClass} />
        </Field>
      </Card>
    </>
  );
}
