# Card Skill System Makefile
# DB卡牌游戏技能系统

CC = gcc
CFLAGS = -Wall -Wextra -O3 -std=c99 -I./include -D_GNU_SOURCE -D_POSIX_C_SOURCE=200809L
DEBUG_FLAGS = -g -DDEBUG

# 源文件
SRCS = src/skill_system.c
HDRS = include/skill_system.h include/keywords.h
TEST_SRC = test/test_skill_system.c

# 输出
LIB = libskill.a
TEST_BIN = test_skill_system

# 默认目标
all: $(LIB)

# 静态库
$(LIB): $(SRCS:.c=.o)
	ar rcs $@ $^

# 编译
src/%.o: src/%.c $(HDRS)
	$(CC) $(CFLAGS) -c $< -o $@

# 测试
test: $(TEST_BIN)
	./$(TEST_BIN)

$(TEST_BIN): $(SRCS) $(TEST_SRC) $(HDRS)
	$(CC) $(CFLAGS) $(SRCS) $(TEST_SRC) -o $@

# 调试版本
debug: CFLAGS += $(DEBUG_FLAGS)
debug: clean $(TEST_BIN)

# 内存检查
valgrind: $(TEST_BIN)
	valgrind --leak-check=full --show-leak-kinds=all ./$(TEST_BIN)

# 代码风格
format:
	clang-format -i $(HDRS) $(SRCS) $(TEST_SRC)

# 清理
clean:
	rm -f src/*.o $(LIB) $(TEST_BIN)

# 安装
install: $(LIB)
	install -d $(DESTDIR)/usr/local/lib
	install -d $(DESTDIR)/usr/local/include
	install -m 644 $(LIB) $(DESTDIR)/usr/local/lib/
	install -m 644 $(HDRS) $(DESTDIR)/usr/local/include/

.PHONY: all test debug valgrind format clean install
