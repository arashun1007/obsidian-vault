import 'package:flutter/material.dart';

import '../models/fish.dart';

/// Displays a species image, or a generated placeholder when no artwork
/// exists yet.
///
/// The placeholder is intentionally distinct per species (colour from the
/// category, plus the first kana character) so the grid stays readable
/// before the image2 pipeline supplies real photos. When [Fish.imageAsset]
/// is populated this widget swaps to the real asset automatically — no
/// other code needs to change.
class FishImage extends StatelessWidget {
  const FishImage({
    super.key,
    required this.fish,
    this.heroTag,
    this.borderRadius,
  });

  final Fish fish;
  final Object? heroTag;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    Widget image = fish.hasImage
        ? Image.asset(
            fish.imageAsset!,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _Placeholder(fish: fish),
          )
        : _Placeholder(fish: fish);

    if (heroTag != null) {
      image = Hero(tag: heroTag!, child: image);
    }
    if (borderRadius != null) {
      image = ClipRRect(borderRadius: borderRadius!, child: image);
    }
    return image;
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.fish});

  final Fish fish;

  @override
  Widget build(BuildContext context) {
    final base = fish.accentColor;
    final hsl = HSLColor.fromColor(base);
    final darker = hsl
        .withLightness((hsl.lightness - 0.18).clamp(0.0, 1.0))
        .toColor();
    final glyph = fish.name.isNotEmpty ? fish.name.characters.first : '魚';

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [base, darker],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // A faint oversized glyph as a texture.
          Positioned(
            right: -8,
            bottom: -14,
            child: Text(
              glyph,
              style: TextStyle(
                fontSize: 96,
                fontWeight: FontWeight.w900,
                color: Colors.white.withValues(alpha: 0.12),
              ),
            ),
          ),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.set_meal_rounded,
                  color: Colors.white.withValues(alpha: 0.9),
                  size: 34,
                ),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    fish.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
