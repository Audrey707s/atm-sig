-- The review queue remains visible through existing task RLS to GM/Super Admin.
-- A status transition creates one inbox event; its existing push trigger uses
-- that same recipient, rather than broadcasting to every possible approver.
CREATE OR REPLACE FUNCTION public.notify_task_review_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Review' THEN
    PERFORM public.notify_task_supervisors(
      NEW.id,
      'task_review_requested',
      'Task menunggu tinjauan Anda',
      'Task "' || NEW.title || '" telah diajukan untuk ditinjau.',
      true
    );
  ELSIF OLD.status = 'Review' AND NEW.status IN ('Done', 'Revisi') THEN
    INSERT INTO public.notifications(user_id, task_id, type, title, body)
    SELECT NEW.owner_id, NEW.id, 'task_review_decision',
      'Hasil tinjauan task',
      'Task "' || NEW.title || '" '
        || CASE WHEN NEW.status = 'Done' THEN 'disetujui.' ELSE 'memerlukan revisi.' END
    FROM public.users owner_row
    WHERE owner_row.id = NEW.owner_id
      AND owner_row.status = 'aktif'
      AND NEW.owner_id IS DISTINCT FROM auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_task_review_status() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER task_review_status_notification
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_task_review_status();
