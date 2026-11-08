-- Colonnes facultatives tolérées par l'insertion des notifications (rôle du destinataire, heure prévue)
alter table public.notifications add column if not exists role text, add column if not exists prevu_a text;
