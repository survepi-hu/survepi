-- Nom de l'épidémie ou de l'événement suivi : paramètre, pour réutiliser SurvEpi sur une autre riposte sans toucher au code.
insert into public.settings (key, value) values ('evenement', '"MVE-17"') on conflict (key) do nothing;
