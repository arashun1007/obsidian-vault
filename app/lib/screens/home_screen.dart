import 'package:flutter/material.dart';

import '../data/favorites_service.dart';
import '../data/fish_repository.dart';
import '../models/fish.dart';
import '../widgets/fish_card.dart';
import 'detail_screen.dart';

enum SortMode {
  recommended('おすすめ順'),
  taste('食味の高い順'),
  priceAsc('価格の安い順'),
  kana('五十音順');

  const SortMode(this.label);
  final String label;
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _repo = FishRepository.instance;
  final _favorites = FavoritesService.instance;
  final _searchController = TextEditingController();

  String _query = '';
  String? _categoryFilter; // null = all
  bool _seasonOnly = false;
  bool _favoritesOnly = false;
  SortMode _sort = SortMode.recommended;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<Fish> get _filtered {
    final month = DateTime.now().month;
    final list = _repo.species.where((f) {
      if (_categoryFilter != null && f.category != _categoryFilter) {
        return false;
      }
      if (_seasonOnly && !f.inSeason(month)) return false;
      if (_favoritesOnly && !_favorites.isFavorite(f.id)) return false;
      if (!f.matches(_query)) return false;
      return true;
    }).toList();

    switch (_sort) {
      case SortMode.recommended:
        break; // repository order: category then kana
      case SortMode.taste:
        list.sort((a, b) {
          final c = b.tasteRating.compareTo(a.tasteRating);
          return c != 0 ? c : a.kana.compareTo(b.kana);
        });
      case SortMode.priceAsc:
        list.sort((a, b) {
          final c = a.priceRating.compareTo(b.priceRating);
          return c != 0 ? c : a.kana.compareTo(b.kana);
        });
      case SortMode.kana:
        list.sort((a, b) => a.kana.compareTo(b.kana));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: AnimatedBuilder(
        animation: _favorites,
        builder: (context, _) {
          final results = _filtered;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                floating: true,
                title: Row(
                  children: [
                    Icon(Icons.set_meal_rounded,
                        color: theme.colorScheme.primary, size: 24),
                    const SizedBox(width: 8),
                    Text('さかな図鑑',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w800)),
                  ],
                ),
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(112),
                  child: Column(
                    children: [
                      _SearchField(
                        controller: _searchController,
                        onChanged: (v) => setState(() => _query = v),
                      ),
                      _FilterBar(
                        categories: _repo.populatedCategories,
                        selected: _categoryFilter,
                        seasonOnly: _seasonOnly,
                        favoritesOnly: _favoritesOnly,
                        favoritesCount: _favorites.count,
                        onCategory: (key) =>
                            setState(() => _categoryFilter = key),
                        onSeason: () =>
                            setState(() => _seasonOnly = !_seasonOnly),
                        onFavorites: () => setState(
                            () => _favoritesOnly = !_favoritesOnly),
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 8, 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${results.length} 種  /  全 ${_repo.speciesCount} 種収録',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                      PopupMenuButton<SortMode>(
                        initialValue: _sort,
                        onSelected: (m) => setState(() => _sort = m),
                        tooltip: '並び替え',
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.sort_rounded, size: 18),
                              const SizedBox(width: 4),
                              Text(_sort.label,
                                  style: theme.textTheme.labelLarge),
                              const Icon(Icons.arrow_drop_down, size: 18),
                            ],
                          ),
                        ),
                        itemBuilder: (context) => [
                          for (final m in SortMode.values)
                            PopupMenuItem(value: m, child: Text(m.label)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              if (results.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: _EmptyState(),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                  sliver: SliverGrid(
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 220,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.72,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, i) {
                        final fish = results[i];
                        return FishCard(
                          fish: fish,
                          highlightInSeason: true,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => DetailScreen(fish: fish),
                            ),
                          ),
                        );
                      },
                      childCount: results.length,
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: SearchBar(
        controller: controller,
        hintText: '和名・別名・学名・科で検索',
        leading: const Icon(Icons.search),
        trailing: [
          if (controller.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                controller.clear();
                onChanged('');
              },
            ),
        ],
        onChanged: onChanged,
        elevation: const WidgetStatePropertyAll(0),
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.categories,
    required this.selected,
    required this.seasonOnly,
    required this.favoritesOnly,
    required this.favoritesCount,
    required this.onCategory,
    required this.onSeason,
    required this.onFavorites,
  });

  final List<FishCategory> categories;
  final String? selected;
  final bool seasonOnly;
  final bool favoritesOnly;
  final int favoritesCount;
  final ValueChanged<String?> onCategory;
  final VoidCallback onSeason;
  final VoidCallback onFavorites;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
          FilterChip(
            label: Text('旬 (${DateTime.now().month}月)'),
            avatar: const Icon(Icons.eco_rounded, size: 18),
            selected: seasonOnly,
            onSelected: (_) => onSeason(),
          ),
          const SizedBox(width: 8),
          FilterChip(
            label: Text('お気に入り${favoritesCount > 0 ? ' $favoritesCount' : ''}'),
            avatar: const Icon(Icons.favorite, size: 16),
            selected: favoritesOnly,
            onSelected: (_) => onFavorites(),
          ),
          const SizedBox(width: 8),
          const _Divider(),
          const SizedBox(width: 8),
          ChoiceChip(
            label: const Text('すべて'),
            selected: selected == null,
            onSelected: (_) => onCategory(null),
          ),
          for (final c in categories) ...[
            const SizedBox(width: 8),
            ChoiceChip(
              label: Text(c.label),
              selected: selected == c.key,
              onSelected: (_) => onCategory(c.key),
              side: BorderSide(color: c.accentColor.withValues(alpha: 0.5)),
            ),
          ],
          const SizedBox(width: 12),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 1,
        height: 24,
        color: Theme.of(context).dividerColor,
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.search_off_rounded,
              size: 56, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text('該当する魚が見つかりませんでした',
              style: theme.textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('検索語やフィルタを変えてみてください',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              )),
        ],
      ),
    );
  }
}
