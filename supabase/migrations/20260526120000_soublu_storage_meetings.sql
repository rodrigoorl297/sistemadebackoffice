-- SOU+BLU — Storage (fotos de perfil / produtos), reuniões DELETE, trigger e-mail
-- Aplicado no projeto dqptnlywbarvznpzgtuj via Supabase MCP

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('profile-photos', 'profile-photos', true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']::text[]),
  ('product-images', 'product-images', true, 10485760, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas em storage.objects (padrão proposal-attachments)
-- Ver migração aplicada no painel Supabase: soublu_storage_meetings

CREATE OR REPLACE FUNCTION public.normalize_user_email()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(trim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_normalize_email ON public.users;
CREATE TRIGGER users_normalize_email
  BEFORE INSERT OR UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.normalize_user_email();
