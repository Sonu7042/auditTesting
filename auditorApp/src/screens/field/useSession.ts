import {useMemo, useState} from 'react';
import {fieldApi} from '../../api/field.api';
import {isNetworkError} from '../../api/client';
import {useOutbox, withPending} from '../../store/OutboxContext';
import {Question, Session} from '../../types/field';
import {useLoad} from '../../ui/useLoad';
import {GROUP_ORDER, groupKeyOf} from '../../utils/field';

export type FlatQuestion = Question & {moduleCode: string; sectionName: string; group: string};
export type Group = {key: string; sections: Array<{name: string; questions: FlatQuestion[]}>; questions: FlatQuestion[]};

export const isAnswered = (q: Question) => q.response?.responseStatus === 'SUBMITTED';

export function useSession(jobId: string) {
  const {pendingFor, cacheSession, cachedSession} = useOutbox();
  const [offline, setOffline] = useState(false);
  const load = useLoad(async () => {
    try {
      const s = await fieldApi.session(jobId);
      await cacheSession(s);
      setOffline(false);
      return s;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      const cached = await cachedSession(jobId);
      if (!cached) throw new Error('You are offline and this checklist has not been opened on this tablet yet. Connect once to download it.');
      setOffline(true);
      return cached;
    }
  }, [jobId]);

  const pending = pendingFor(jobId);
  const session: Session | null = useMemo(() => (load.data ? withPending(load.data, pending) : null), [load.data, pending]);

  const flat: FlatQuestion[] = useMemo(
    () =>
      (session?.modules || []).flatMap(m =>
        m.sections.flatMap(sec => sec.questions.map(q => ({...q, moduleCode: m.moduleCode, sectionName: sec.sectionName, group: groupKeyOf(q, m.moduleCode)}))),
      ),
    [session],
  );

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const q of flat) {
      if (!map.has(q.group)) map.set(q.group, {key: q.group, sections: [], questions: []});
      const g = map.get(q.group)!;
      g.questions.push(q);
      let sec = g.sections.find(x => x.name === q.sectionName);
      if (!sec) {
        sec = {name: q.sectionName, questions: []};
        g.sections.push(sec);
      }
      sec.questions.push(q);
    }
    return [...map.values()].sort((a, b) => GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key));
  }, [flat]);

  return {...load, session, flat, groups, offline, pending};
}
