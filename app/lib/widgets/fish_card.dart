import 'package:flutter/material.dart';

import '../data/favorites_service.dart';
import '../models/fish.dart';
import '../util/season.dart';
import 'fish_image.dart';
import 'star_rating.dart';

/// Grid tile for a single species.
class FishCard extends StatelessWidget {
  const FishCard({
    super.key,
    required this.fish,
    required this.onTap,
    this.highlightInSeason = false,
  });

  final Fish fish;
  final VoidCallback onTap;

  /// When true and the fish is in season this month, show a badge.
  final bool highlightInSeason;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final inSeason =
        highlightInSeason && fish.inSeason(DateTime.now().month);

    return Card(
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  FishImage(fish: fish, heroTag: 'fish-${fish.id}'),
                  Positioned(
                    top: 6,
                    left: 6,
                    child: _Tag(
                      label: fish.categoryLabel,
                      color: fish.accentColor,
                    ),
                  ),
                  if (inSeason)
                    const Positioned(
                      top: 6,
                      right: 6,
                      child: _SeasonBadge(),
                    ),
                  Positioned(
                    bottom: 4,
                    right: 4,
                    child: _FavoriteButton(fish: fish),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fish.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '旬 ${Season.label(fish.seasonMonths)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 3),
                  StarRating(value: fish.tasteRating, size: 14),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _SeasonBadge extends StatelessWidget {
  const _SeasonBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFE8663A),
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.eco_rounded, size: 12, color: Colors.white),
          SizedBox(width: 3),
          Text(
            '旬',
            style: TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _FavoriteButton extends StatelessWidget {
  const _FavoriteButton({required this.fish});
  final Fish fish;

  @override
  Widget build(BuildContext context) {
    final favorites = FavoritesService.instance;
    return AnimatedBuilder(
      animation: favorites,
      builder: (context, _) {
        final fav = favorites.isFavorite(fish.id);
        return Material(
          color: Colors.black.withValues(alpha: 0.32),
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => favorites.toggle(fish.id),
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: Icon(
                fav ? Icons.favorite : Icons.favorite_border,
                size: 18,
                color: fav ? const Color(0xFFFF6B7A) : Colors.white,
              ),
            ),
          ),
        );
      },
    );
  }
}
