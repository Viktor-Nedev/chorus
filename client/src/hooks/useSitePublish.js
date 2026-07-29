import { useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

const BUCKET = 'sites';

// Публикува frontend/ файловете на генерирания проект в публичен Supabase
// Storage bucket → истински споделим URL, без Node сървър и без Docker.
export function useSitePublish() {
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);

  const available = !!supabase && !!user;

  const publish = useCallback(
    async (projectId, files, projectName) => {
      if (!supabase) throw new Error('Publishing needs Supabase — add VITE_SUPABASE_ANON_KEY.');
      if (!user) throw new Error('Sign in to publish your site.');
      const frontend = (files || []).filter((f) => f.path?.startsWith('frontend/'));
      if (!frontend.length) throw new Error('Generate the website first.');

      setPublishing(true);
      try {
        const base = `${user.id}/${projectId}`;
        for (const f of frontend) {
          const rel = f.path.replace(/^frontend\//, '');
          const ext = rel.split('.').pop()?.toLowerCase();
          const contentType =
            ext === 'html' ? 'text/html' :
            ext === 'css' ? 'text/css' :
            ext === 'js' ? 'text/javascript' :
            ext === 'json' ? 'application/json' : 'text/plain';
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(`${base}/${rel}`, new Blob([f.content], { type: contentType }), {
              contentType,
              upsert: true,
            });
          if (error) throw new Error(error.message);
        }

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${base}/index.html`);
        const url = data.publicUrl;

        // Регистър „моите сайтове" (best-effort — линкът работи и без него)
        await supabase
          .from('webforge_sites')
          .upsert(
            { id: projectId, user_id: user.id, project_name: projectName || 'Website', path: base, url },
            { onConflict: 'id' }
          )
          .then(null, () => {});

        return { url, files: frontend.length };
      } finally {
        setPublishing(false);
      }
    },
    [user]
  );

  const listMySites = useCallback(async () => {
    if (!supabase || !user) return [];
    const { data } = await supabase
      .from('webforge_sites')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return data || [];
  }, [user]);

  return { publish, listMySites, publishing, available };
}
