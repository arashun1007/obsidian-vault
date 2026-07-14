import 'package:flutter/material.dart';

/// A row of five stars showing [value] (0-5, half steps supported).
class StarRating extends StatelessWidget {
  const StarRating({
    super.key,
    required this.value,
    this.size = 18,
    this.color = const Color(0xFFF5A623),
    this.showValue = false,
  });

  final double value;
  final double size;
  final Color color;
  final bool showValue;

  @override
  Widget build(BuildContext context) {
    final stars = <Widget>[];
    for (var i = 1; i <= 5; i++) {
      final IconData icon;
      if (value >= i) {
        icon = Icons.star_rounded;
      } else if (value >= i - 0.5) {
        icon = Icons.star_half_rounded;
      } else {
        icon = Icons.star_outline_rounded;
      }
      stars.add(Icon(icon, size: size, color: color));
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ...stars,
        if (showValue) ...[
          SizedBox(width: size * 0.35),
          Text(
            value.toStringAsFixed(1),
            style: TextStyle(
              fontSize: size * 0.8,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ],
    );
  }
}

/// A labelled star row used in the detail "評価" section.
class LabeledStars extends StatelessWidget {
  const LabeledStars({
    super.key,
    required this.label,
    required this.value,
    this.color = const Color(0xFFF5A623),
  });

  final String label;
  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          SizedBox(
            width: 64,
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 8),
          StarRating(value: value, size: 20, color: color),
          const SizedBox(width: 8),
          Text(
            value.toStringAsFixed(1),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
