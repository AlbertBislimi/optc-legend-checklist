# Legend Checklist
Assets are taken from the mobile game 'One Piece Treasure Cruise'.

All rights reserved by &copy; BANDAI NAMCO Entertainment.

This is purely a fan-made project to serve as a progress checker for players.

## Official event gem data

`data/gem-events.json` is the small, reviewed list shown in the Banner Planner. Each entry is classified as a claim, earnable reward, or chance prize, and must link to its official source. Only selected claim/earnable rewards affect a user's forecast; chance prizes never do.

The scheduled **Refresh OPTC campaign feed** GitHub Action pulls the public official campaign feed into `data/official-campaign-feed.json` every six hours. It never changes `gem-events.json`, so reviewed totals cannot be overwritten by a scraper. Review new source posts, then add or retire verified entries in `gem-events.json` when appropriate.

## Pirate Rumble meta teams

The dedicated `rumble.html` PvP Meta page turns a player's saved collection into a roster-aware team guide: it shows the source-ordered core team, fills a slot with an owned replacement when possible, and checks the important type, class, tag, and unit conditions for that setup.

Team archetypes and replacement roles are credited to and linked from [Nydato's OPTC Rumble & Grand Party Guides](https://docs.google.com/spreadsheets/d/1IvYZjjs9SAMF9L_Wj9ql-5hqg5tgcOVNYvfFZSKWroI/edit?gid=475890873#gid=475890873). The guide is the community source; this project presents a compact, roster-aware view and does not replace in-game condition checks.

`data/rumble-meta.json` is the reviewed team snapshot. Update it after a vetted meta review or when Nydato's composition/replacement guidance changes. `data/rumble-meta-units.json` is generated and should not be edited by hand: it holds current upstream stats, classes, and tags only for units referenced by the reviewed snapshot.

The scheduled **Refresh OPTC Rumble unit data** GitHub Action refreshes that generated unit snapshot every six hours from the OPTC DB. This keeps displayed stats and tag checks current without claiming that a raw stat change automatically rewrites a human-reviewed team tier.
