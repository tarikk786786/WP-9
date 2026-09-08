insert into bot_settings (id, enabled, welcome_message, fallback_message, human_handoff_message, timezone)
values (1, true, 'hey, kya ho raha hai', 'haan, dekh liya. thoda aur bata', 'theek, human pe bhej raha hoon. thoda wait', 'Asia/Kolkata')
on conflict (id) do nothing;
