# Array Loop Patterns

Most patterns are an index loop with a different start, stop, or step. Use a signed `int` index when counting down, because an unsigned `std::size_t` never goes below 0.

All examples use this vector:

```cpp
#include <iostream>
#include <vector>

std::vector<int> v = {10, 11, 12, 13, 14, 15};
int n = (int)v.size();          // 6, signed so n - 1 is safe
```

### Reverse

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::vector<int> v = {10, 11, 12, 13, 14, 15};
    int n = (int)v.size();
    {{code}}
    std::cout << '\n';
}
```

```cpp
for (int i = n - 1; i >= 0; i--) {
    std::cout << v[i] << ' ';       // 15 14 13 12 11 10
}

for (auto it = v.rbegin(); it != v.rend(); ++it) {
    std::cout << *it << ' ';        // 15 14 13 12 11 10
}
```

### Every other one

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::vector<int> v = {10, 11, 12, 13, 14, 15};
    int n = (int)v.size();
    {{code}}
    std::cout << '\n';
}
```

```cpp
for (int i = 0; i < n; i += 2) { }  // even indexes: 10 12 14
for (int i = 1; i < n; i += 2) { }  // odd indexes:  11 13 15

for (int x : v) {
    if (x % 2 != 0) continue;       // skip odd values
    std::cout << x << ' ';          // 10 12 14
}
```

### First k, last k

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::vector<int> v = {10, 11, 12, 13, 14, 15};
    int n = (int)v.size();
    {{code}}
    for (int i = 0; i < std::min(3, n); i++) std::cout << v[i] << ' ';
    std::cout << '\n';
    for (int i = std::max(0, n - 2); i < n; i++) std::cout << v[i] << ' ';
    std::cout << '\n';
}
```

```cpp
#include <algorithm>   // std::max, std::min

for (int i = 0; i < std::min(3, n); i++) { }   // 10 11 12
for (int i = std::max(0, n - 2); i < n; i++) { }  // 14 15
```

### Neighbors (compare with the previous one)

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::vector<int> v = {10, 11, 12, 13, 14, 15};
    int n = (int)v.size();
    {{code}}
    std::cout << '\n';
}
```

```cpp
for (int i = 1; i < n; i++) {
    std::cout << v[i] - v[i - 1] << ' ';   // 1 1 1 1 1
}
```

### Every pair

```cpp
std::vector<int> a = {1, 2, 3};
for (int i = 0; i < (int)a.size(); i++) {
    for (int j = i + 1; j < (int)a.size(); j++) {
        std::cout << a[i] << a[j] << ' ';   // 12 13 23
    }
}
```

### Two pointers from both ends

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::vector<int> v = {10, 11, 12, 13, 14, 15};
    int n = (int)v.size();
    {{code}}
    for (int x : r) std::cout << x << ' ';
    std::cout << '\n' << sorted[lo] << " + " << sorted[hi] << '\n';
}
```

```cpp
#include <utility>     // std::swap

std::vector<int> r = v;
for (int i = 0, j = n - 1; i < j; i++, j--) {
    std::swap(r[i], r[j]);          // reverses r in place
}
// Same thing: std::reverse(r.begin(), r.end());

std::vector<int> sorted = {1, 3, 4, 6, 9};   // find a pair summing to 10
int lo = 0, hi = (int)sorted.size() - 1;
while (lo < hi) {
    int sum = sorted[lo] + sorted[hi];
    if (sum == 10) break;
    if (sum < 10) lo++;
    else hi--;
}
// sorted[lo] + sorted[hi] is 1 + 9
```

### Wrap around with %

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::vector<int> v = {10, 11, 12, 13, 14, 15};
    int n = (int)v.size();
    {{code}}
    std::cout << '\n';
}
```

```cpp
for (int i = 0; i < n; i++) {
    std::cout << v[(i + 2) % n] << ' ';   // 12 13 14 15 10 11
}
```

### Sliding window of size k

```cpp
std::vector<int> s = {2, 1, 5, 1, 3, 2};
int k = 3, window = 0, best = 0;
for (int i = 0; i < (int)s.size(); i++) {
    window += s[i];                       // add the new right end
    if (i >= k) window -= s[i - k];       // drop the old left end
    if (i >= k - 1) best = std::max(best, window);
}
// best is 9 (5 + 1 + 3)
```

### Prefix sums and running max

```cpp harness
#include <bits/stdc++.h>
using namespace std;

int main() {
    std::vector<int> s = {2, 1, 5, 1, 3, 2};
    {{code}}
    std::cout << '\n';
    for (int x : prefix) std::cout << x << ' ';
    std::cout << '\n' << prefix[4] - prefix[1] << '\n';
}
```

```cpp
std::vector<int> prefix(s.size() + 1, 0);
for (std::size_t i = 0; i < s.size(); i++) {
    prefix[i + 1] = prefix[i] + s[i];     // {0, 2, 3, 8, 9, 12, 14}
}
prefix[4] - prefix[1];                    // 7, sum of s[1] through s[3]

int run = 0;
for (int x : s) {
    run = std::max(run, x);
    std::cout << run << ' ';              // 2 2 5 5 5 5
}
```

### Chunks of 3

```cpp
std::vector<int> c = {1, 2, 3, 4, 5, 6, 7};
for (std::size_t i = 0; i < c.size(); i += 3) {
    for (std::size_t j = i; j < i + 3 && j < c.size(); j++) {
        std::cout << c[j];
    }
    std::cout << ' ';                     // 123 456 7
}
```

| Pattern | Loop header |
|---|---|
| reverse | `for (int i = n - 1; i >= 0; i--)` |
| every other | `for (int i = 0; i < n; i += 2)` |
| neighbors | `for (int i = 1; i < n; i++)` with `v[i - 1]` |
| all pairs | `for (j = i + 1; j < n; j++)` inside `for i` |
| both ends | `for (int i = 0, j = n - 1; i < j; i++, j--)` |
| circular | index with `v[(i + k) % n]` |
| rotate left by 2 | `std::rotate(v.begin(), v.begin() + 2, v.end())` |

### Gotchas

- `for (std::size_t i = v.size() - 1; i >= 0; i--)` never ends: unsigned `i` wraps to a huge number instead of reaching -1.
- `v[i + 1]` or `v[i - 1]` at the edges reads out of bounds silently. Start at 1 or stop at `n - 1`.
- `%` with a negative left side gives a negative result in C++ (`-1 % 6` is `-1`). Use `((i % n) + n) % n` when stepping backward.
