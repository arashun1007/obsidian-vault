import 'package:flutter/material.dart';

import '../data/favorites_service.dart';
import '../data/fish_repository.dart';
import '../models/fish.dart';
import '../util/season.dart';
import '../widgets/fish_image.dart';
import '../widgets/flavor_radar.dart';
import '../widgets/star_rating.dart';

class DetailScreen extends StatelessWidget {
  const DetailScreen({super.key, required this.fish});

  final Fish fish;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final favorites = FavoritesService.instance;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 260,
            pinned: true,
            actions: [
              AnimatedBuilder(
                animation: favorites,
                builder: (context, _) {
                  final fav = favorites.isFavorite(fish.id);
                  return IconButton(
                    tooltip: fav ? 'お気に入りから外す' : 'お気に入りに追加',
                    icon: Icon(
                      fav ? Icons.favorite : Icons.favorite_border,
                      color: fav ? const Color(0xFFFF6B7A) : null,
                    ),
                    onPressed: () => favorites.toggle(fish.id),
                  );
                },
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: FishImage(fish: fish, heroTag: 'fish-${fish.id}'),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Header(fish: fish),
                  const SizedBox(height: 16),
                  _CategoryChip(fish: fish),
                  const SizedBox(height: 20),
                  _SeasonBar(months: fish.seasonMonths),
                  const SizedBox(height: 24),
                  _Section(
                    title: '評価',
                    child: _RatingBlock(fish: fish),
                  ),
                  _Section(
                    title: '味わいプロファイル',
                    child: Center(
                      child: FlavorRadar(
                        axes: FishRepository.instance.flavorAxes,
                        values: fish.flavor,
                        color: fish.accentColor,
                        size: 240,
                      ),
                    ),
                  ),
                  _Section(
                    title: '解説',
                    child: Text(
                      fish.description,
                      style: theme.textTheme.bodyLarge?.copyWith(height: 1.6),
                    ),
                  ),
                  _Section(
                    title: '基本情報',
                    child: _InfoTable(fish: fish),
                  ),
                  if (fish.aliases.isNotEmpty)
                    _Section(
                      title: '別名・地方名',
                      child: _Wrap(items: fish.aliases, color: fish.accentColor),
                    ),
                  _Section(
                    title: '主な料理・食べ方',
                    child: _Wrap(
                      items: fish.cookingMethods,
                      color: theme.colorScheme.primary,
                      icon: Icons.restaurant_rounded,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.fish});
  final Fish fish;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(fish.kana,
            style: theme.textTheme.labelLarge
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        Text(
          fish.name,
          style: theme.textTheme.headlineMedium
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text(
          '${fish.scientificName}  /  ${fish.family}',
          style: theme.textTheme.bodyMedium?.copyWith(
            fontStyle: FontStyle.italic,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _RatingBlock extends StatelessWidget {
  const _RatingBlock({required this.fish});
  final Fish fish;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        LabeledStars(label: '食味', value: fish.tasteRating),
        LabeledStars(
          label: '価格帯',
          value: fish.priceRating,
          color: const Color(0xFF4CAF82),
        ),
        LabeledStars(
          label: '希少度',
          value: fish.rarityRating,
          color: const Color(0xFF7E8CE0),
        ),
      ],
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.fish});
  final Fish fish;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: fish.accentColor.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: fish.accentColor.withValues(alpha: 0.5)),
      ),
      child: Text(
        fish.categoryLabel,
        style: TextStyle(
          color: fish.accentColor,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// A 12-month strip that highlights the in-season months.
class _SeasonBar extends StatelessWidget {
  const _SeasonBar({required this.months});
  final List<int> months;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now().month;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.eco_rounded,
                size: 18, color: theme.colorScheme.primary),
            const SizedBox(width: 6),
            Text('旬 ${Season.label(months)}',
                style: theme.textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            const gap = 4.0;
            final w = (constraints.maxWidth - gap * 11) / 12;
            return Row(
              children: [
                for (var m = 1; m <= 12; m++) ...[
                  if (m > 1) const SizedBox(width: gap),
                  _MonthCell(
                    month: m,
                    width: w,
                    active: months.contains(m),
                    isNow: m == now,
                  ),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _MonthCell extends StatelessWidget {
  const _MonthCell({
    required this.month,
    required this.width,
    required this.active,
    required this.isNow,
  });

  final int month;
  final double width;
  final bool active;
  final bool isNow;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        Container(
          width: width,
          height: 30,
          decoration: BoxDecoration(
            color: active
                ? const Color(0xFFE8663A)
                : scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(6),
            border: isNow
                ? Border.all(color: scheme.primary, width: 2)
                : null,
          ),
          alignment: Alignment.center,
          child: Text(
            '$month',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: active ? Colors.white : scheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _InfoTable extends StatelessWidget {
  const _InfoTable({required this.fish});
  final Fish fish;

  @override
  Widget build(BuildContext context) {
    final rows = <(String, String)>[
      ('学名', fish.scientificName),
      ('科', fish.family),
      ('分類', fish.categoryLabel),
      ('大きさ', '最大 約${fish.typicalSizeCm}cm'),
      ('分布', fish.distribution),
      ('生息域', fish.habitat),
      ('味わい', fish.taste),
    ];
    final theme = Theme.of(context);
    return Column(
      children: [
        for (final (k, v) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 68,
                  child: Text(k,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      )),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(v,
                      style: theme.textTheme.bodyMedium?.copyWith(height: 1.5)),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Wrap extends StatelessWidget {
  const _Wrap({required this.items, required this.color, this.icon});
  final List<String> items;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final item in items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 14, color: color),
                  const SizedBox(width: 5),
                ],
                Text(item,
                    style: TextStyle(
                        color: color, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
      ],
    );
  }
}
