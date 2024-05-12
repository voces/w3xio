import { GraphQLResolveInfo } from 'npm:graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type ResolverFn<TResult, TParent, TContext, TArgs> = (args: TArgs, context: TContext, info: GraphQLResolveInfo) => Promise<TResult> | TResult
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type RuleKey =
  | 'map'
  | 'host'
  | 'name'
  | 'server';

export type Rule = {
  readonly __typename?: 'Rule';
  readonly key: RuleKey;
  readonly value: Scalars['String']['output'];
};

export type Alert = {
  readonly __typename?: 'Alert';
  readonly id: Scalars['String']['output'];
  readonly message: Maybe<Scalars['String']['output']>;
  readonly rules: ReadonlyArray<Rule>;
};

export type Query = {
  readonly __typename?: 'Query';
  readonly alert: Alert;
};


export type QueryAlertArgs = {
  channelId: Scalars['String']['input'];
};

export type UpsertType =
  | 'created'
  | 'updated';

export type AlertResult = {
  readonly __typename?: 'AlertResult';
  readonly action: UpsertType;
  readonly alert: Alert;
};

export type RuleInput = {
  readonly key: RuleKey;
  readonly value: Scalars['String']['input'];
};

export type Mutation = {
  readonly __typename?: 'Mutation';
  readonly alert: AlertResult;
  readonly deleteAlert: Maybe<Scalars['Boolean']['output']>;
};


export type MutationAlertArgs = {
  channelId: Scalars['String']['input'];
  rules: ReadonlyArray<RuleInput>;
  message: InputMaybe<Scalars['String']['input']>;
};


export type MutationDeleteAlertArgs = {
  channelId: Scalars['String']['input'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  RuleKey: RuleKey;
  Rule: ResolverTypeWrapper<Rule>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Alert: ResolverTypeWrapper<Alert>;
  Query: ResolverTypeWrapper<{}>;
  UpsertType: UpsertType;
  AlertResult: ResolverTypeWrapper<AlertResult>;
  RuleInput: RuleInput;
  Mutation: ResolverTypeWrapper<{}>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Rule: Rule;
  String: Scalars['String']['output'];
  Alert: Alert;
  Query: {};
  AlertResult: AlertResult;
  RuleInput: RuleInput;
  Mutation: {};
  Boolean: Scalars['Boolean']['output'];
};

export type RuleResolvers<ContextType = any, ParentType extends ResolversParentTypes['Rule'] = ResolversParentTypes['Rule']> = {
  key: Resolver<ResolversTypes['RuleKey'], ParentType, ContextType>;
  value: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AlertResolvers<ContextType = any, ParentType extends ResolversParentTypes['Alert'] = ResolversParentTypes['Alert']> = {
  id: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rules: Resolver<ReadonlyArray<ResolversTypes['Rule']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  alert: Resolver<ResolversTypes['Alert'], ParentType, ContextType, RequireFields<QueryAlertArgs, 'channelId'>>;
};

export type AlertResultResolvers<ContextType = any, ParentType extends ResolversParentTypes['AlertResult'] = ResolversParentTypes['AlertResult']> = {
  action: Resolver<ResolversTypes['UpsertType'], ParentType, ContextType>;
  alert: Resolver<ResolversTypes['Alert'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  alert: Resolver<ResolversTypes['AlertResult'], ParentType, ContextType, RequireFields<MutationAlertArgs, 'channelId' | 'rules'>>;
  deleteAlert: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteAlertArgs, 'channelId'>>;
};

export type Resolvers<ContextType = any> = {
  Rule: RuleResolvers<ContextType>;
  Alert: AlertResolvers<ContextType>;
  Query: QueryResolvers<ContextType>;
  AlertResult: AlertResultResolvers<ContextType>;
  Mutation: MutationResolvers<ContextType>;
};

