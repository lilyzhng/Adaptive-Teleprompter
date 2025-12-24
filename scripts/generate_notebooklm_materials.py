#!/usr/bin/env python3
"""
Generate NotebookLM-optimized study materials for the 75 Blind LeetCode questions.
Creates a master study guide and category-specific files for focused study sessions.
"""

import csv
import os
from collections import defaultdict
from pathlib import Path

# Category mapping from CSV categories to our organized file structure
CATEGORY_MAPPING = {
    "Arrays": "01_arrays_hashing",
    "Binary": "10_bit_manipulation",
    "Dynamic Programming": "07_dynamic_programming",
    "Graph": "06_graphs",
    "Interval": "09_intervals",
    "Linked List": "04_linked_lists",
    "Matrix": "03_matrix",
    "String": "02_strings_two_pointers",
    "Tree": "05_trees",
    "Heap": "08_heaps",
}

# Category descriptions for the overview section
CATEGORY_DESCRIPTIONS = {
    "01_arrays_hashing": {
        "title": "Arrays & Hashing",
        "description": "Problems involving array manipulation, hash maps for O(1) lookups, and prefix/suffix computations.",
        "when_to_use": "Use hash maps when you need instant lookup. Use two pointers when array is sorted or you need to find pairs. Use prefix sums for range queries.",
        "complexity": "Usually O(n) time with O(n) space for hash-based solutions, O(1) space for two-pointer solutions.",
    },
    "02_strings_two_pointers": {
        "title": "Strings & Two Pointers",
        "description": "String manipulation, palindromes, anagrams, and sliding window techniques.",
        "when_to_use": "Use sliding window for substring problems. Use two pointers for palindrome checks. Use hash maps for anagram detection.",
        "complexity": "Usually O(n) time. Sliding window is O(n) with O(k) space where k is window size or charset.",
    },
    "03_matrix": {
        "title": "Matrix",
        "description": "2D array traversal, rotation, and search problems.",
        "when_to_use": "Use layer-by-layer for rotation/spiral. Use DFS/BFS for path finding. Mark visited cells in-place when possible.",
        "complexity": "Usually O(m*n) time where m and n are matrix dimensions.",
    },
    "04_linked_lists": {
        "title": "Linked Lists",
        "description": "Pointer manipulation, cycle detection, merging, and reordering.",
        "when_to_use": "Use slow/fast pointers for cycle detection and finding middle. Use dummy nodes to simplify edge cases. Reverse in-place when needed.",
        "complexity": "Usually O(n) time with O(1) space for in-place operations.",
    },
    "05_trees": {
        "title": "Trees",
        "description": "Binary trees, BSTs, traversals, and tree construction problems.",
        "when_to_use": "Use recursion for most tree problems. Use iterative BFS for level-order. Use in-order traversal for BST properties. Use post-order when you need children results first.",
        "complexity": "Usually O(n) time and O(h) space where h is tree height (O(log n) balanced, O(n) skewed).",
    },
    "06_graphs": {
        "title": "Graphs",
        "description": "Graph traversal, cycle detection, topological sort, and connected components.",
        "when_to_use": "Use DFS for path finding and cycle detection. Use BFS for shortest path (unweighted). Use Union-Find for connected components. Use topological sort for dependency ordering.",
        "complexity": "Usually O(V + E) time where V is vertices and E is edges.",
    },
    "07_dynamic_programming": {
        "title": "Dynamic Programming",
        "description": "Optimization problems with overlapping subproblems and optimal substructure.",
        "when_to_use": "Use DP when problem has optimal substructure and overlapping subproblems. Start with recursion + memoization, then optimize to iterative if needed.",
        "complexity": "Time varies by problem. Space can often be optimized from O(n^2) to O(n) or O(1).",
    },
    "08_heaps": {
        "title": "Heaps & Priority Queues",
        "description": "Problems requiring efficient min/max operations, k-th element finding, and streaming data.",
        "when_to_use": "Use min-heap for k largest elements. Use max-heap for k smallest. Use two heaps for median finding.",
        "complexity": "O(log k) per operation where k is heap size. Building heap is O(n).",
    },
    "09_intervals": {
        "title": "Intervals",
        "description": "Interval merging, insertion, and overlap detection problems.",
        "when_to_use": "Always sort intervals first (usually by start time). Merge overlapping intervals greedily. Use min-heap for meeting rooms.",
        "complexity": "Usually O(n log n) due to sorting, then O(n) for processing.",
    },
    "10_bit_manipulation": {
        "title": "Bit Manipulation",
        "description": "Binary operations, bit counting, and XOR tricks.",
        "when_to_use": "Use XOR to find missing/duplicate numbers. Use bit shifts for division/multiplication by 2. Use n & (n-1) to clear lowest set bit.",
        "complexity": "Usually O(1) or O(log n) time with O(1) space.",
    },
}

# Difficulty mapping based on problem patterns
DIFFICULTY_MAP = {
    "Two Sum": "Easy",
    "Best Time to Buy and Sell Stock": "Easy",
    "Contains Duplicate": "Easy",
    "Product of Array Except Self": "Medium",
    "Maximum Subarray": "Medium",
    "Maximum Product Subarray": "Medium",
    "Find Minimum in Rotated Sorted Array": "Medium",
    "Search in Rotated Sorted Array": "Medium",
    "3Sum": "Medium",
    "Container With Most Water": "Medium",
    "Sum of Two Integers": "Medium",
    "Number of 1 Bits": "Easy",
    "Counting Bits": "Easy",
    "Missing Number": "Easy",
    "Reverse Bits": "Easy",
    "Climbing Stairs": "Easy",
    "Coin Change": "Medium",
    "Longest Increasing Subsequence": "Medium",
    "Longest Common Subsequence": "Medium",
    "Word Break Problem": "Medium",
    "Combination Sum": "Medium",
    "House Robber": "Medium",
    "House Robber II": "Medium",
    "Decode Ways": "Medium",
    "Unique Paths": "Medium",
    "Jump Game": "Medium",
    "Clone Graph": "Medium",
    "Course Schedule": "Medium",
    "Pacific Atlantic Water Flow": "Medium",
    "Number of Islands": "Medium",
    "Longest Consecutive Sequence": "Medium",
    "Alien Dictionary (Leetcode Premium)": "Hard",
    "Graph Valid Tree (Leetcode Premium)": "Medium",
    "Number of Connected Components in an Undirected Graph (Leetcode Premium)": "Medium",
    "Insert Interval": "Medium",
    "Merge Intervals": "Medium",
    "Non-overlapping Intervals": "Medium",
    "Meeting Rooms (Leetcode Premium)": "Easy",
    "Meeting Rooms II (Leetcode Premium)": "Medium",
    "Reverse a Linked List": "Easy",
    "Detect Cycle in a Linked List": "Easy",
    "Merge Two Sorted Lists": "Easy",
    "Merge K Sorted Lists": "Hard",
    "Remove Nth Node From End Of List": "Medium",
    "Reorder List": "Medium",
    "Set Matrix Zeroes": "Medium",
    "Spiral Matrix": "Medium",
    "Rotate Image": "Medium",
    "Word Search": "Medium",
    "Longest Substring Without Repeating Characters": "Medium",
    "Longest Repeating Character Replacement": "Medium",
    "Minimum Window Substring": "Hard",
    "Valid Anagram": "Easy",
    "Group Anagrams": "Medium",
    "Valid Parentheses": "Easy",
    "Valid Palindrome": "Easy",
    "Longest Palindromic Substring": "Medium",
    "Palindromic Substrings": "Medium",
    "Encode and Decode Strings (Leetcode Premium)": "Medium",
    "Maximum Depth of Binary Tree": "Easy",
    "Same Tree": "Easy",
    "Invert/Flip Binary Tree": "Easy",
    "Binary Tree Maximum Path Sum": "Hard",
    "Binary Tree Level Order Traversal": "Medium",
    "Serialize and Deserialize Binary Tree": "Hard",
    "Subtree of Another Tree": "Easy",
    "Construct Binary Tree from Preorder and Inorder Traversal": "Medium",
    "Validate Binary Search Tree": "Medium",
    "Kth Smallest Element in a BST": "Medium",
    "Lowest Common Ancestor of BST": "Medium",
    "Implement Trie (Prefix Tree)": "Medium",
    "Add and Search Word": "Medium",
    "Word Search II": "Hard",
    "Top K Frequent Elements": "Medium",
    "Find Median from Data Stream": "Hard",
}

# Time and Space Complexity for each problem
COMPLEXITY_MAP = {
    "Two Sum": ("O(n)", "O(n)"),
    "Best Time to Buy and Sell Stock": ("O(n)", "O(1)"),
    "Contains Duplicate": ("O(n)", "O(n)"),
    "Product of Array Except Self": ("O(n)", "O(1)*"),
    "Maximum Subarray": ("O(n)", "O(1)"),
    "Maximum Product Subarray": ("O(n)", "O(1)"),
    "Find Minimum in Rotated Sorted Array": ("O(log n)", "O(1)"),
    "Search in Rotated Sorted Array": ("O(log n)", "O(1)"),
    "3Sum": ("O(n²)", "O(1)"),
    "Container With Most Water": ("O(n)", "O(1)"),
    "Sum of Two Integers": ("O(1)", "O(1)"),
    "Number of 1 Bits": ("O(1)", "O(1)"),
    "Counting Bits": ("O(n)", "O(n)"),
    "Missing Number": ("O(n)", "O(1)"),
    "Reverse Bits": ("O(1)", "O(1)"),
    "Climbing Stairs": ("O(n)", "O(1)"),
    "Coin Change": ("O(n*m)", "O(n)"),
    "Longest Increasing Subsequence": ("O(n²)", "O(n)"),
    "Longest Common Subsequence": ("O(m*n)", "O(m*n)"),
    "Word Break Problem": ("O(n²)", "O(n)"),
    "Combination Sum": ("O(2^n)", "O(n)"),
    "House Robber": ("O(n)", "O(1)"),
    "House Robber II": ("O(n)", "O(1)"),
    "Decode Ways": ("O(n)", "O(1)"),
    "Unique Paths": ("O(m*n)", "O(n)"),
    "Jump Game": ("O(n)", "O(1)"),
    "Clone Graph": ("O(V+E)", "O(V)"),
    "Course Schedule": ("O(V+E)", "O(V+E)"),
    "Pacific Atlantic Water Flow": ("O(m*n)", "O(m*n)"),
    "Number of Islands": ("O(m*n)", "O(m*n)"),
    "Longest Consecutive Sequence": ("O(n)", "O(n)"),
    "Alien Dictionary (Leetcode Premium)": ("O(C)", "O(1)"),
    "Graph Valid Tree (Leetcode Premium)": ("O(V+E)", "O(V)"),
    "Number of Connected Components in an Undirected Graph (Leetcode Premium)": ("O(V+E)", "O(V)"),
    "Insert Interval": ("O(n)", "O(n)"),
    "Merge Intervals": ("O(n log n)", "O(n)"),
    "Non-overlapping Intervals": ("O(n log n)", "O(1)"),
    "Meeting Rooms (Leetcode Premium)": ("O(n log n)", "O(1)"),
    "Meeting Rooms II (Leetcode Premium)": ("O(n log n)", "O(n)"),
    "Reverse a Linked List": ("O(n)", "O(1)"),
    "Detect Cycle in a Linked List": ("O(n)", "O(1)"),
    "Merge Two Sorted Lists": ("O(n+m)", "O(1)"),
    "Merge K Sorted Lists": ("O(N log k)", "O(k)"),
    "Remove Nth Node From End Of List": ("O(n)", "O(1)"),
    "Reorder List": ("O(n)", "O(1)"),
    "Set Matrix Zeroes": ("O(m*n)", "O(1)"),
    "Spiral Matrix": ("O(m*n)", "O(1)"),
    "Rotate Image": ("O(n²)", "O(1)"),
    "Word Search": ("O(m*n*4^L)", "O(L)"),
    "Longest Substring Without Repeating Characters": ("O(n)", "O(min(m,n))"),
    "Longest Repeating Character Replacement": ("O(n)", "O(26)"),
    "Minimum Window Substring": ("O(n+m)", "O(m)"),
    "Valid Anagram": ("O(n)", "O(1)"),
    "Group Anagrams": ("O(n*k)", "O(n*k)"),
    "Valid Parentheses": ("O(n)", "O(n)"),
    "Valid Palindrome": ("O(n)", "O(1)"),
    "Longest Palindromic Substring": ("O(n²)", "O(1)"),
    "Palindromic Substrings": ("O(n²)", "O(1)"),
    "Encode and Decode Strings (Leetcode Premium)": ("O(n)", "O(1)"),
    "Maximum Depth of Binary Tree": ("O(n)", "O(h)"),
    "Same Tree": ("O(n)", "O(h)"),
    "Invert/Flip Binary Tree": ("O(n)", "O(h)"),
    "Binary Tree Maximum Path Sum": ("O(n)", "O(h)"),
    "Binary Tree Level Order Traversal": ("O(n)", "O(n)"),
    "Serialize and Deserialize Binary Tree": ("O(n)", "O(n)"),
    "Subtree of Another Tree": ("O(m*n)", "O(h)"),
    "Construct Binary Tree from Preorder and Inorder Traversal": ("O(n)", "O(n)"),
    "Validate Binary Search Tree": ("O(n)", "O(h)"),
    "Kth Smallest Element in a BST": ("O(h+k)", "O(h)"),
    "Lowest Common Ancestor of BST": ("O(h)", "O(1)"),
    "Implement Trie (Prefix Tree)": ("O(m)", "O(m)"),
    "Add and Search Word": ("O(m)", "O(1)"),
    "Word Search II": ("O(m*n*4^L)", "O(W*L)"),
    "Top K Frequent Elements": ("O(n log k)", "O(n)"),
    "Find Median from Data Stream": ("O(log n)", "O(n)"),
}


def extract_key_pattern(notes: str, category: str, name: str = "") -> str:
    """Extract the key pattern/technique from the notes."""
    # Special case overrides for known problems
    pattern_overrides = {
        "Find Minimum in Rotated Sorted Array": "Binary Search",
        "Search in Rotated Sorted Array": "Binary Search",
        "Container With Most Water": "Two Pointers",
        "3Sum": "Two Pointers, Sorting",
        "Valid Palindrome": "Two Pointers",
        "Product of Array Except Self": "Prefix/Suffix Products",
        "Longest Consecutive Sequence": "Hash Set",
    }
    
    if name in pattern_overrides:
        return pattern_overrides[name]
    
    patterns = {
        "hash map": "Hash Map",
        "hashmap": "Hash Map",
        "hashset": "Hash Set",
        "sliding window": "Sliding Window",
        "two pointers": "Two Pointers",
        "left/right": "Two Pointers",
        "left, right": "Two Pointers",
        "dfs": "DFS (Depth-First Search)",
        "bfs": "BFS (Breadth-First Search)",
        "dynamic programming": "Dynamic Programming",
        "dp:": "Dynamic Programming",
        "dp ": "Dynamic Programming",
        "recursion": "Recursion",
        "recursive": "Recursion",
        "binary search": "Binary Search",
        "sorted": "Binary Search",
        "divide and conquer": "Divide and Conquer",
        "greedy": "Greedy",
        "backtracking": "Backtracking",
        "trie": "Trie",
        "heap": "Heap/Priority Queue",
        "priority": "Heap/Priority Queue",
        "union find": "Union-Find",
        "topological": "Topological Sort",
        "topsort": "Topological Sort",
        "bit shift": "Bit Manipulation",
        "bitwise": "Bit Manipulation",
        "xor": "XOR/Bit Manipulation",
        "stack": "Stack",
        "queue": "Queue",
        "prefix": "Prefix Sum/Product",
        "memoization": "Memoization",
        "cache": "Memoization",
    }
    
    notes_lower = notes.lower()
    found_patterns = []
    for pattern, name_p in patterns.items():
        if pattern in notes_lower and name_p not in found_patterns:
            found_patterns.append(name_p)
    
    if found_patterns:
        return ", ".join(found_patterns[:2])  # Return top 2 patterns
    return category  # Fallback to category


def extract_insight(notes: str) -> str:
    """Extract the key insight (the 'aha' moment) from the notes."""
    # Get the first meaningful sentence/phrase
    parts = notes.split(";")
    if parts:
        insight = parts[0].strip()
        # Capitalize first letter
        if insight:
            insight = insight[0].upper() + insight[1:]
        return insight
    return notes


def parse_leetcode_csv(csv_path: str) -> list[dict]:
    """Parse the LeetCode 75 questions CSV file."""
    questions = []
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)
        
        # Find the header row (row with "Video Solution", "Category", etc.)
        header_idx = None
        for i, row in enumerate(rows):
            if len(row) >= 4 and row[0] == "Video Solution":
                header_idx = i
                break
        
        if header_idx is None:
            raise ValueError("Could not find header row in CSV")
        
        # Parse data rows
        for row in rows[header_idx + 1:]:
            if len(row) >= 5 and row[1] and row[2]:  # Has category and name
                video_url = row[0].strip()
                category = row[1].strip()
                name = row[2].strip()
                leetcode_url = row[3].strip()
                notes = row[4].strip() if len(row) > 4 else ""
                
                # Skip if it's a duplicate (Merge K Sorted Lists appears twice)
                if any(q["name"] == name for q in questions):
                    continue
                
                questions.append({
                    "video_url": video_url,
                    "category": category,
                    "name": name,
                    "leetcode_url": leetcode_url,
                    "notes": notes,
                    "difficulty": DIFFICULTY_MAP.get(name, "Medium"),
                    "key_pattern": extract_key_pattern(notes, category, name),
                    "insight": extract_insight(notes),
                })
    
    return questions


def generate_question_markdown(q: dict, include_links: bool = True) -> str:
    """Generate markdown for a single question."""
    time_c, space_c = COMPLEXITY_MAP.get(q['name'], ("O(?)", "O(?)"))
    
    md = f"### {q['name']}\n\n"
    md += f"**Difficulty:** {q['difficulty']} | **Time:** {time_c} | **Space:** {space_c}\n\n"
    md += f"**Key Pattern:** {q['key_pattern']}\n\n"
    md += f"**The Insight:** {q['insight']}\n\n"
    md += f"**Full Approach:** {q['notes']}\n\n"
    
    if include_links:
        md += f"**Resources:**\n"
        md += f"- [LeetCode Problem]({q['leetcode_url']})\n"
        md += f"- [NeetCode Video Solution]({q['video_url']})\n"
    
    md += "\n---\n\n"
    return md


def generate_quiz_prompts(questions: list[dict], category_key: str) -> str:
    """Generate quiz prompts for a category."""
    md = "## Quick Quiz Prompts\n\n"
    md += "Use these questions to test your understanding:\n\n"
    
    for q in questions[:5]:  # Top 5 questions for quiz
        md += f"1. **{q['name']}**: What is the key technique and its time complexity?\n"
    
    md += "\n### Pattern Recognition Questions\n\n"
    
    # Add category-specific questions
    category_questions = {
        "01_arrays_hashing": [
            "When should you use a hash map vs. two pointers?",
            "How do you handle duplicates in array problems?",
            "What's the difference between prefix sum and sliding window approaches?",
        ],
        "02_strings_two_pointers": [
            "When do you use sliding window vs. two pointers?",
            "How do you detect anagrams efficiently?",
            "What's the expand-from-center technique for palindromes?",
        ],
        "04_linked_lists": [
            "When do you use slow/fast pointers?",
            "Why use a dummy node at the head?",
            "How do you reverse a linked list in-place?",
        ],
        "05_trees": [
            "When do you use DFS vs. BFS for trees?",
            "How does in-order traversal help with BST problems?",
            "What's the pattern for tree path sum problems?",
        ],
        "06_graphs": [
            "How do you detect cycles in directed vs. undirected graphs?",
            "When do you use Union-Find vs. DFS?",
            "What problems require topological sort?",
        ],
        "07_dynamic_programming": [
            "How do you identify if a problem needs DP?",
            "What's the difference between top-down and bottom-up DP?",
            "How do you optimize DP space complexity?",
        ],
        "09_intervals": [
            "Why do you always sort intervals first?",
            "How do you merge overlapping intervals?",
            "When do you need a min-heap for interval problems?",
        ],
        "10_bit_manipulation": [
            "How does XOR help find missing/duplicate numbers?",
            "What does n & (n-1) do?",
            "How do you count set bits efficiently?",
        ],
    }
    
    for question in category_questions.get(category_key, []):
        md += f"- {question}\n"
    
    return md


def generate_category_file(category_key: str, questions: list[dict], output_dir: Path) -> None:
    """Generate a category-specific markdown file."""
    cat_info = CATEGORY_DESCRIPTIONS.get(category_key, {
        "title": category_key.replace("_", " ").title(),
        "description": "",
        "when_to_use": "",
        "complexity": "",
    })
    
    md = f"# {cat_info['title']}\n\n"
    md += "## Category Overview\n\n"
    md += f"{cat_info['description']}\n\n"
    md += f"**When to Use:** {cat_info['when_to_use']}\n\n"
    md += f"**Typical Complexity:** {cat_info['complexity']}\n\n"
    md += "---\n\n"
    md += "## Problems\n\n"
    
    for q in questions:
        md += generate_question_markdown(q)
    
    md += generate_quiz_prompts(questions, category_key)
    
    # Pattern cheat sheet
    md += "\n\n## Pattern Cheat Sheet\n\n"
    md += "| Problem | Key Pattern | Time | Space |\n"
    md += "|---------|-------------|------|-------|\n"
    
    for q in questions:
        time_c, space_c = COMPLEXITY_MAP.get(q['name'], ("O(?)", "O(?)"))
        md += f"| {q['name']} | {q['key_pattern']} | {time_c} | {space_c} |\n"
    
    output_path = output_dir / f"{category_key}.md"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"Generated: {output_path}")


def generate_master_file(questions: list[dict], output_dir: Path) -> None:
    """Generate the master study guide with all 75 questions."""
    md = "# LeetCode 75 Blind Questions - Master Study Guide\n\n"
    md += "This comprehensive guide covers all 75 essential LeetCode problems for coding interviews.\n\n"
    md += "## Table of Contents\n\n"
    
    # Group by category
    by_category = defaultdict(list)
    for q in questions:
        cat_key = CATEGORY_MAPPING.get(q["category"], "00_other")
        by_category[cat_key].append(q)
    
    # Sort categories
    sorted_categories = sorted(by_category.keys())
    
    # TOC
    for cat_key in sorted_categories:
        cat_info = CATEGORY_DESCRIPTIONS.get(cat_key, {"title": cat_key})
        md += f"- [{cat_info['title']}](#{cat_key})\n"
    
    md += "\n---\n\n"
    
    # Content by category
    for cat_key in sorted_categories:
        cat_info = CATEGORY_DESCRIPTIONS.get(cat_key, {
            "title": cat_key.replace("_", " ").title(),
            "description": "",
            "when_to_use": "",
        })
        
        md += f"## {cat_info['title']} {{#{cat_key}}}\n\n"
        md += f"*{cat_info['description']}*\n\n"
        md += f"**When to Use:** {cat_info['when_to_use']}\n\n"
        
        for q in by_category[cat_key]:
            md += generate_question_markdown(q)
    
    # Master quiz section
    md += "## Master Quiz - Test Your Knowledge\n\n"
    md += "### Quick Fire Questions\n\n"
    
    quiz_questions = [
        "What data structure solves Two Sum in O(n)?",
        "How do you detect a cycle in a linked list with O(1) space?",
        "What's the key insight for the Maximum Subarray problem?",
        "When should you use DFS vs BFS for graph problems?",
        "How do you find the middle of a linked list in one pass?",
        "What's the pattern for interval merging problems?",
        "How does XOR help find a missing number?",
        "What are the two approaches for House Robber?",
        "When do you use a Trie?",
        "What's the sliding window pattern for substring problems?",
    ]
    
    for i, q in enumerate(quiz_questions, 1):
        md += f"{i}. {q}\n"
    
    md += "\n### Category Matching\n\n"
    md += "Match each problem to its primary technique:\n\n"
    md += "| Problem | Technique |\n"
    md += "|---------|----------|\n"
    
    sample_problems = [
        ("Two Sum", "Hash Map"),
        ("Longest Substring Without Repeating", "Sliding Window"),
        ("Number of Islands", "DFS/BFS"),
        ("Coin Change", "Dynamic Programming"),
        ("Merge K Sorted Lists", "Heap/Divide & Conquer"),
    ]
    
    for prob, tech in sample_problems:
        md += f"| {prob} | {tech} |\n"
    
    output_path = output_dir / "leetcode_75_master_study_guide.md"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(md)
    
    print(f"Generated: {output_path}")


def main():
    # Paths
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    csv_path = project_dir / "views" / "Leetcode 75 Questions (NeetCode on yt) - Sheet1.csv"
    output_dir = project_dir / "notebooklm"
    
    # Create output directory
    output_dir.mkdir(exist_ok=True)
    
    print(f"Parsing CSV: {csv_path}")
    questions = parse_leetcode_csv(str(csv_path))
    print(f"Found {len(questions)} questions")
    
    # Group questions by category
    by_category = defaultdict(list)
    for q in questions:
        cat_key = CATEGORY_MAPPING.get(q["category"], "00_other")
        by_category[cat_key].append(q)
    
    # Generate category files
    print("\nGenerating category files...")
    for cat_key, cat_questions in sorted(by_category.items()):
        generate_category_file(cat_key, cat_questions, output_dir)
    
    # Generate master file
    print("\nGenerating master study guide...")
    generate_master_file(questions, output_dir)
    
    print(f"\nDone! Files written to: {output_dir}")
    print("\nNotebookLM Usage Tips:")
    print("1. Upload 'leetcode_75_master_study_guide.md' for the full overview")
    print("2. Create separate notebooks per category for focused study")
    print("3. Use NotebookLM's 'Audio Overview' for podcast-style learning")
    print("4. Use 'Quiz' and 'Flashcard' features for active recall practice")


if __name__ == "__main__":
    main()

