import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { LikesModule } from './likes/likes.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RagModule } from './rag/rag.module.js';
import { RegionsModule } from './regions/regions.module.js';
import { SearchModule } from './search/search.module.js';
import { TagsModule } from './tags/tags.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    RegionsModule,
    CategoriesModule,
    PostsModule,
    CommentsModule,
    TagsModule,
    LikesModule,
    SearchModule,
    RagModule,
    AgentModule
  ]
})
export class AppModule {}
