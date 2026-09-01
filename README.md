# Legend Checklist
Assets are taken from the mobile game 'One Piece Treasure Cruise'.

All rights reserved by &copy; BANDAI NAMCO Entertainment.

This is purely a fan-made project to serve as a progress checker for players.

## Official event gem data

`data/gem-events.json` is the small, reviewed list shown in the Banner Planner. Each entry is classified as a claim, earnable reward, or chance prize, and must link to its official source. Only selected claim/earnable rewards affect a user's forecast; chance prizes never do.

The scheduled **Refresh OPTC campaign feed** GitHub Action pulls the public official campaign feed into `data/official-campaign-feed.json` every six hours. It never changes `gem-events.json`, so reviewed totals cannot be overwritten by a scraper. Review new source posts, then add or retire verified entries in `gem-events.json` when appropriate.
